import { Upload } from '@aws-sdk/lib-storage'
import { randomUUID } from 'node:crypto'
import { PassThrough } from 'node:stream'
import s3Client from '#services/s3_client'
import uploadConfig from '#config/upload'
import logger from '@adonisjs/core/services/logger'

export interface UploadResult {
  fileId: string
  filename: string
  path: string
  size: number
  mimeType: string
}

export interface MultipartStream extends NodeJS.ReadableStream {
  filename?: string
  headers: Record<string, string | string[] | undefined>
}

export class FileUploadService {
  /**
   * Sanitize filename to prevent path traversal attacks
   */
  private sanitizeFilename(filename: string): string {
    // Remove path traversal characters and keep only safe characters
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 255)
  }

  /**
   * Generate S3 path for upload
   */
  private generatePath(filename: string): string {
    const fileId = randomUUID()
    const sanitizedFilename = this.sanitizeFilename(filename)
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')

    return `${uploadConfig.uploadBasePath}/${year}/${month}/${day}/${fileId}_${sanitizedFilename}`
  }

  /**
   * Validate MIME type against allowed types
   */
  private validateMimeType(mimeType: string): boolean {
    return uploadConfig.allowedMimeTypes.some((type) => mimeType.startsWith(type))
  }

  /**
   * Upload file to S3 with streaming
   */
  async upload(part: MultipartStream): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `Upload timeout: No file received within ${uploadConfig.uploadTimeoutMs / 1000} seconds`
          )
        )
      }, uploadConfig.uploadTimeoutMs)

      const body = new PassThrough()
      let size = 0
      let sizeExceeded = false

      const contentType = part.headers['content-type']
      const mimeType = Array.isArray(contentType)
        ? contentType[0]
        : contentType || 'application/octet-stream'

      if (!this.validateMimeType(mimeType)) {
        clearTimeout(timeout)
        body.destroy()
        reject(new Error(`Invalid file type: ${mimeType}`))
        return
      }

      const originalFilename = part.filename || 'unnamed'
      const path = this.generatePath(originalFilename)
      const fileId = randomUUID()

      part.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > uploadConfig.maxFileSize && !sizeExceeded) {
          sizeExceeded = true
          body.destroy()
          clearTimeout(timeout)
          reject(
            new Error(
              `File size exceeds maximum limit of ${uploadConfig.maxFileSize / (1024 * 1024)}MB`
            )
          )
        }
      })

      part.on('error', (error: unknown) => {
        body.destroy()
        clearTimeout(timeout)
        logger.error({ error }, 'Stream error during file upload')
        reject(error instanceof Error ? error : new Error(String(error)))
      })

      part.on('end', () => {
        if (size === 0) {
          body.destroy()
          clearTimeout(timeout)
          reject(new Error('Empty files are not allowed'))
        }
      })

      part.pipe(body)

      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: uploadConfig.s3Bucket,
          Key: path,
          Body: body,
          ContentType: mimeType,
        },
      })

      upload
        .done()
        .then(() => {
          clearTimeout(timeout)
          if (sizeExceeded) {
            reject(new Error('File size exceeded during upload'))
            return
          }
          resolve({
            fileId,
            filename: `${fileId}_${this.sanitizeFilename(originalFilename)}`,
            path,
            size,
            mimeType,
          })
        })
        .catch((error) => {
          clearTimeout(timeout)
          body.destroy()
          logger.error({ error }, 'S3 upload failed')
          reject(error instanceof Error ? error : new Error(String(error)))
        })
    })
  }

  /**
   * Delete file from S3
   */
  async delete(path: string): Promise<void> {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3')
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: uploadConfig.s3Bucket,
        Key: path,
      })
    )
  }
}

export default new FileUploadService()
