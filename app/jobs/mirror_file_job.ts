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

export default class MirrorFileJob extends Job {
  static get $$filepath() {
    return import.meta.url
  }

  async handle(payload: MirrorFileJobPayload) {
    const { fileId, mirror } = payload

    logger.info(`Starting mirror job for file: ${fileId}`)

    const file = await File.find(fileId)

    if (!file) {
      logger.error(`File not found: ${fileId}`)
      throw new Error(`File not found: ${fileId}`)
    }

    await file.merge({ status: 'processing' }).save()
    logger.info(`File status updated to processing: ${fileId}`)

    const mirrorsToProcess = mirror ? [mirror] : await this.getMirrorsList()

    for (const mirrorService of mirrorsToProcess) {
      await this.processMirror(file, mirrorService)
    }

    await this.updateFileStatus(fileId)

    logger.info(`Mirror job completed successfully for file: ${fileId}`)
  }

  private async processMirror(file: File, mirrorService: string): Promise<void> {
    const existingMirror = await FileMirror.query()
      .where('file_id', file.id)
      .where('mirror', mirrorService)
      .first()

    if (existingMirror && existingMirror.status === 'done') {
      logger.info(`Mirror already exists for ${mirrorService}, skipping`)
      return
    }

    const fileMirror =
      existingMirror ||
      (await FileMirror.create({
        fileId: file.id,
        mirror: mirrorService,
        status: 'queued',
        attempts: 0,
      }))

    await fileMirror.merge({ status: 'uploading', attempts: fileMirror.attempts + 1 }).save()

    const jobId = `${file.id}-${mirrorService}-${Date.now()}`
    logger.info(`Calling worker for upload job ${jobId} - ${mirrorService}: ${file.filename}`)

    try {
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
          service: mirrorService,
          serviceConfig: await this.getServiceConfig(mirrorService),
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Worker returned ${response.status}: ${errorText}`)
      }

      const result = (await response.json()) as MirrorUploadResult
      logger.info(`Worker response for job ${jobId}: ${result.success ? 'success' : 'failure'}`)

      if (result.success) {
        const expiresAt = result.expiresAt
          ? DateTime.fromISO(result.expiresAt)
          : null

        await fileMirror.merge({
          status: 'done',
          url: result.downloadUrl || null,
          metadata: result.metadata || null,
          expiresAt,
        }).save()
        logger.info(`Mirror ${mirrorService} completed for file ${file.id}`)
      } else {
        await fileMirror.merge({
          status: 'failed',
          metadata: { error: result.error, ...result.metadata },
        }).save()
        logger.error(`Mirror ${mirrorService} failed for file ${file.id}: ${result.error}`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error(`Worker call failed for job ${jobId}:`, error)

      await fileMirror.merge({
        status: 'failed',
        metadata: { error: errorMessage },
      }).save()
      logger.error(`Mirror ${mirrorService} failed for file ${file.id}: ${errorMessage}`)
    }
  }

  private async updateFileStatus(fileId: string): Promise<void> {
    const mirrors = await FileMirror.query().where('file_id', fileId)
    const allDone = mirrors.every((m) => m.status === 'done')
    const anyFailed = mirrors.some((m) => m.status === 'failed')

    if (allDone) {
      const file = await File.find(fileId)
      if (file) {
        await file.merge({ status: 'completed' }).save()
        logger.info(`File status updated to completed: ${fileId}`)
      }
    } else if (anyFailed) {
      const file = await File.find(fileId)
      if (file && file.status !== 'completed') {
        await file.merge({ status: 'failed' }).save()
        logger.info(`File status updated to failed: ${fileId}`)
      }
    }
  }

  private async getMirrorsList(): Promise<string[]> {
    const mirrors = await Mirror.query()
      .where('enabled', true)
      .orderBy('priority', 'asc')
      .select('name')
    
    return mirrors.map((mirror) => mirror.name)
  }

  private async getServiceConfig(service: string): Promise<Record<string, string>> {
    const mirror = await Mirror.query()
      .where('name', service)
      .where('enabled', true)
      .first()

    if (mirror?.config) {
      const config = Object.entries(mirror.config).reduce((acc, [key, value]) => {
        acc[key] = String(value)
        return acc
      }, {} as Record<string, string>)
      return config
    }

    return {}
  }

  async rescue(payload: MirrorFileJobPayload) {
    const { fileId } = payload

    logger.error(`Mirror job failed for file: ${fileId}`)

    const file = await File.find(fileId)

    if (file) {
      await file.merge({ status: 'failed' }).save()
      logger.info(`File status updated to failed: ${fileId}`)
    }

    const fileMirrors = await FileMirror.query().where('file_id', fileId)

    for (const mirror of fileMirrors) {
      if (mirror.status !== 'done') {
        await mirror.merge({ status: 'failed' }).save()
        logger.info(`FileMirror status updated to failed: ${mirror.id}`)
      }
    }

    logger.error(`Rescue completed for file: ${fileId}`)
  }
}
