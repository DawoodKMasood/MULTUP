import { Job } from '@rlanz/bull-queue'
import File from '#models/file'
import FileMirror from '#models/file_mirror'
import drive from '@adonisjs/drive/services/main'
import logger from '@adonisjs/core/services/logger'

interface MirrorFileJobPayload {
  fileId: string
}

export default class MirrorFileJob extends Job {
  // This is the path to the file that is used to create the job
  static get $$filepath() {
    return import.meta.url
  }

  /**
   * Base Entry point
   */
  async handle(payload: MirrorFileJobPayload) {
    const { fileId } = payload

    logger.info(`Starting mirror job for file: ${fileId}`)

    const file = await File.find(fileId)

    if (!file) {
      logger.error(`File not found: ${fileId}`)
      throw new Error(`File not found: ${fileId}`)
    }

    await file.merge({ status: 'processing' }).save()
    logger.info(`File status updated to processing: ${fileId}`)

    // This is where we do mirror service

    await file.merge({ status: 'completed' }).save()
    logger.info(`File status updated to completed: ${fileId}`)

    logger.info(`Mirror job completed successfully for file: ${fileId}`)
  }

  /**
   * This is an optional method that gets called when the retries has exceeded and is marked failed.
   */
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
      await mirror.merge({ status: 'failed' }).save()
      logger.info(`FileMirror status updated to failed: ${mirror.id}`)
    }

    logger.error(`Rescue completed for file: ${fileId}`)
  }
}
