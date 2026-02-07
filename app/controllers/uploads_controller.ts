import type { HttpContext } from '@adonisjs/core/http'
import { FileUploadService } from '#services/file_upload_service'
import { FileService } from '#services/file_service'
import logger from '@adonisjs/core/services/logger'
import { inject } from '@adonisjs/core'

@inject()
export default class UploadsController {
  constructor(
    private fileUploadService: FileUploadService,
    private fileService: FileService
  ) {}

  async store({ request, response }: HttpContext) {
    const contentType = request.header('content-type') || ''

    if (!contentType.includes('multipart/form-data')) {
      return response.status(400).send({
        error: 'Invalid Content-Type. Expected: multipart/form-data',
        received: contentType || 'none',
      })
    }

    const multipart = request.multipart

    if (!multipart) {
      return response.status(400).send({ error: 'Multipart parser not available' })
    }

    let fileProcessed = false

    return new Promise((resolve) => {
      multipart.onFile('file', {}, async (part) => {
        fileProcessed = true

        try {
          if (!part.filename || part.filename.trim() === '') {
            resolve(response.status(400).send({ error: 'Filename is required' }))
            return
          }

          const uploadResult = await this.fileUploadService.upload(part)
          const file = await this.fileService.create({
            id: uploadResult.fileId,
            filename: uploadResult.filename,
            path: uploadResult.path,
            size: uploadResult.size,
            status: 'pending',
          })

          resolve(response.status(201).send(file))
        } catch (error) {
          logger.error({ error }, 'File upload failed')
          const message =
            error instanceof Error ? error.message : 'Internal server error during upload'
          const statusCode = message.includes('timeout')
            ? 408
            : message.includes('size')
              ? 413
              : message.includes('Invalid file type')
                ? 415
                : 500
          resolve(response.status(statusCode).send({ error: message }))
        }
      })

      multipart
        .process()
        .then(() => {
          if (!fileProcessed) {
            resolve(
              response.status(400).send({ error: 'No file uploaded. Expected field: "file"' })
            )
          }
        })
        .catch((error: Error) => {
          logger.error({ error }, 'Multipart processing error')
          resolve(response.status(400).send({ error: 'Failed to process multipart request' }))
        })
    })
  }
}
