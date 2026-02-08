import { DateTime } from 'luxon'
import { Job } from '@rlanz/bull-queue'
import File from '#models/file'
import FileMirror from '#models/file_mirror'
import Mirror from '#models/mirror'
import logger from '@adonisjs/core/services/logger'
import drive from '@adonisjs/drive/services/main'
import env from '#start/env'

interface MirrorFileJobPayload {
  fileId: string
  mirror?: string
}

interface MirrorUploadResult {
  jobId: string
  fileId: string
  service: string
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

export default class MirrorFileJob extends Job {
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
    await Promise.all(mirrorsToProcess.map((m) => this.processMirror(file, m)))

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

    try {
      const result = await this.callWorker(jobId, file, service, config)
      await this.handleWorkerResult(fileMirror, result, jobId, service, file.id)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.handleWorkerError(fileMirror, errorMessage, logCtx, jobId)
    }
  }

  private async callWorker(
    jobId: string,
    file: File,
    service: string,
    config: Record<string, unknown>
  ): Promise<MirrorUploadResult> {
    const signedUrl = await drive.use().getSignedUrl(file.path, { expiresIn: '10m' })
    const workerUrl = env.get('MIRROR_WORKER_URL')

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
    })

    if (!response.ok) {
      throw new Error(`Worker returned ${response.status}: ${await response.text()}`)
    }

    return (await response.json()) as MirrorUploadResult
  }

  private async handleWorkerResult(
    fileMirror: FileMirror,
    result: MirrorUploadResult,
    jobId: string,
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

    if (!allDone && !anyFailed) return

    const file = await File.find(fileId)
    if (!file) return

    const newStatus = allDone ? 'completed' : file.status !== 'completed' ? 'failed' : null
    if (newStatus) {
      await file.merge({ status: newStatus }).save()
    }
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
