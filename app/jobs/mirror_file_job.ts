import { DateTime } from 'luxon'
import { Job } from '@rlanz/bull-queue'
import File, { type FileStatus } from '#models/file'
import FileMirror from '#models/file_mirror'
import Mirror from '#models/mirror'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const s3Client = new S3Client({
  region: env.get('AWS_REGION'),
  endpoint: env.get('AWS_ENDPOINT'),
  credentials: {
    accessKeyId: env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: env.get('AWS_SECRET_ACCESS_KEY'),
  },
})

const BUCKET = env.get('S3_BUCKET')

interface MirrorFileJobPayload {
  fileId: string
  mirror?: string
}

interface MirrorUploadResult {
  success: boolean
  downloadUrl?: string
  error?: string
  metadata?: Record<string, unknown>
  expiresAt?: string | null
}

interface MirrorConfig {
  config: Record<string, unknown>
  maxFileSize: number
}

async function pAll<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = []
  const executing: Promise<void>[] = []
  let index = 0

  for (const task of tasks) {
    const p = task().then((result) => {
      results[index++] = result
    })
    executing.push(p)

    if (executing.length >= concurrency) {
      await Promise.race(executing)
      executing.splice(executing.findIndex((x) => x === p), 1)
    }
  }

  await Promise.all(executing)
  return results
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default class MirrorFileJob extends Job {
  private readonly MAX_RETRIES = 3
  private readonly RETRY_BASE_DELAY_MS = 1000
  private readonly FETCH_TIMEOUT_MS = 30000
  private readonly CONCURRENCY_LIMIT = 5
  static get $$filepath() {
    return import.meta.url
  }

  async handle(payload: MirrorFileJobPayload) {
    const { fileId, mirror } = payload

    const file = await File.find(fileId)
    if (!file) {
      logger.error({ fileId, job: 'mirror' }, 'File not found')
      throw new Error(`File not found: ${fileId}`)
    }

    await file.merge({ status: 'processing' }).save()

    const mirrorsToProcess = mirror ? [mirror] : await this.getMirrorsList()
    const tasks = mirrorsToProcess.map((m) => () => this.processMirror(file, m))
    await pAll(tasks, this.CONCURRENCY_LIMIT)

    await this.updateFileStatus(fileId)
  }

  private async processMirror(file: File, service: string): Promise<void> {
    const logCtx = { fileId: file.id, service }

    const existingMirror = await FileMirror.query()
      .where('file_id', file.id)
      .where('mirror', service)
      .first()

    if (existingMirror?.status === 'done') {
      return
    }

    const { config, maxFileSize } = await this.getMirrorConfig(service)
    if (maxFileSize > 0 && file.size > maxFileSize) {
      return
    }

    const fileMirror =
      existingMirror ||
      (await FileMirror.create({
        fileId: file.id,
        mirror: service,
        status: 'queued',
        attempts: 0,
      }))

    await fileMirror.merge({ status: 'uploading', attempts: fileMirror.attempts + 1 }).save()

    const jobId = `${file.id}-${service}-${Date.now()}`

    let lastError: string | null = null
    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1)
          logger.info({ fileId: file.id, service, attempt, delay }, 'Retrying mirror upload')
          await sleep(delay)
          await fileMirror.merge({ attempts: fileMirror.attempts + 1 }).save()
        }
        const result = await this.callWorker(jobId, file, service, config)
        await this.handleWorkerResult(fileMirror, result, service, file.id)
        return
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error'
        logger.warn({ fileId: file.id, service, attempt, error: lastError }, 'Mirror upload attempt failed')
        if (fileMirror.attempts >= this.MAX_RETRIES) {
          break
        }
      }
    }

    if (lastError) {
      await this.handleWorkerError(fileMirror, lastError, logCtx, jobId)
    }
  }

  private async callWorker(
    jobId: string,
    file: File,
    service: string,
    config: Record<string, unknown>
  ): Promise<MirrorUploadResult> {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: file.path,
    })
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 600 })
    const workerUrl = env.get('MIRROR_WORKER_URL')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.FETCH_TIMEOUT_MS)

    try {
      const response = await fetch(`${workerUrl}/mirror`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          fileId: file.id,
          fileUrl: signedUrl,
          filename: file.filename,
          size: file.size,
          service,
          serviceConfig: config,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Worker returned ${response.status}: ${await response.text()}`)
      }

      return (await response.json()) as MirrorUploadResult
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timed out after ${this.FETCH_TIMEOUT_MS}ms`)
      }
      throw error
    }
  }

  private async handleWorkerResult(
    fileMirror: FileMirror,
    result: MirrorUploadResult,
    service: string,
    fileId: string
  ): Promise<void> {
    if (result.success) {
      await fileMirror
        .merge({
          status: 'done',
          url: result.downloadUrl || null,
          metadata: result.metadata || null,
          expiresAt: result.expiresAt ? DateTime.fromISO(result.expiresAt) : null,
        })
        .save()
    } else {
      await fileMirror
        .merge({
          status: 'failed',
          metadata: { error: result.error, ...result.metadata },
        })
        .save()
      logger.error({ fileId, service, error: result.error }, 'Mirror upload failed')
    }
  }

  private async handleWorkerError(
    fileMirror: FileMirror,
    errorMessage: string,
    logCtx: Record<string, unknown>,
    jobId: string
  ): Promise<void> {
    logger.error({ ...logCtx, jobId, error: errorMessage }, 'Mirror worker call failed')

    await fileMirror
      .merge({
        status: 'failed',
        metadata: { error: errorMessage },
      })
      .save()
  }

  private async updateFileStatus(fileId: string): Promise<void> {
    const mirrors = await FileMirror.query().where('file_id', fileId)
    const allDone = mirrors.every((m) => m.status === 'done')
    const anyFailed = mirrors.some((m) => m.status === 'failed')
    const hasSomeDone = mirrors.some((m) => m.status === 'done')

    if (!allDone && !anyFailed) return

    const file = await File.find(fileId)
    if (!file) return

    const newStatus = this.calculateFileStatus(allDone, anyFailed, file.status, hasSomeDone)
    if (newStatus) {
      await file.merge({ status: newStatus }).save()
    }
  }

  private calculateFileStatus(allDone: boolean, anyFailed: boolean, _currentStatus: FileStatus, hasSomeDone: boolean): FileStatus | null {
    if (allDone) return 'completed'
    if (anyFailed && !hasSomeDone) return 'failed'
    if (hasSomeDone && anyFailed) return 'completed'
    return null
  }

  private async getMirrorsList(): Promise<string[]> {
    const mirrors = await Mirror.query()
      .where('enabled', true)
      .orderBy('priority', 'asc')
      .select('name')
    return mirrors.map((m) => m.name)
  }

  private async getMirrorConfig(service: string): Promise<MirrorConfig> {
    const mirror = await Mirror.query().where('name', service).where('enabled', true).first()
    const config = mirror?.config || {}
    const maxFileSize = typeof config.maxFileSize === 'number' ? config.maxFileSize : 0

    return { config, maxFileSize }
  }

  async rescue(payload: MirrorFileJobPayload) {
    const { fileId } = payload

    const file = await File.find(fileId)
    if (file) {
      await file.merge({ status: 'failed' }).save()
    }

    await FileMirror.query()
      .where('file_id', fileId)
      .whereNot('status', 'done')
      .update({ status: 'failed' })

    logger.error({ fileId }, 'Mirror job rescued - marked as failed')
  }
}
