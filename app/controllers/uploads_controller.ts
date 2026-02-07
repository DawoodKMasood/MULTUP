import type { HttpContext } from '@adonisjs/core/http'
import { Upload } from '@aws-sdk/lib-storage'
import { randomUUID } from 'node:crypto'
import { PassThrough } from 'node:stream'
import env from '#start/env'
import s3Client from '#services/s3_client'
import File from '#models/file'
import logger from '@adonisjs/core/services/logger'

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB
const ALLOWED_MIME_TYPES = ['image/', 'video/', 'application/pdf', 'application/zip']

type MultipartStream = NodeJS.ReadableStream & {
  filename?: string
  headers: Record<string, string | string[] | undefined>
}

export default class UploadsController {
  async store({ request, response }: HttpContext) {
    const multipart = request.multipart
    let fileProcessed = false

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!fileProcessed) {
          reject(new Error('Upload timeout: No file received within 5 minutes'))
        }
      }, 5 * 60 * 1000)

      multipart.onFile('file', {}, async (part: MultipartStream) => {
        fileProcessed = true
        clearTimeout(timeout)
        const body = new PassThrough()

        try {
          const contentType = part.headers['content-type']
          const mimeType = Array.isArray(contentType) ? contentType[0] : contentType

          if (!mimeType || !ALLOWED_MIME_TYPES.some(type => mimeType.startsWith(type))) {
            body.destroy()
            reject(new Error(`Invalid file type: ${mimeType}. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`))
            return
          }

          const fileId = randomUUID()
          const originalFilename = part.filename || `file_${new Date().toISOString().replace(/[:.]/g, '-')}`
          const filename = `${fileId}_${originalFilename}`
          const now = new Date()
          const year = now.getFullYear()
          const month = String(now.getMonth() + 1).padStart(2, '0')
          const day = String(now.getDate()).padStart(2, '0')
          const path = `uploads/${year}/${month}/${day}/${fileId}`
          let size = 0

          let sizeExceeded = false
          part.on('data', (chunk: Buffer) => {
            size += chunk.length
            if (size > MAX_FILE_SIZE && !sizeExceeded) {
              sizeExceeded = true
              body.destroy()
            }
          })

          part.on('error', (error: unknown) => {
            body.destroy()
            reject(error)
          })

          part.pipe(body)

          const upload = new Upload({
            client: s3Client,
            params: {
              Bucket: env.get('S3_BUCKET'),
              Key: path,
              Body: body,
              ContentType: mimeType,
            },
          })

          await upload.done()

          const file = await File.create({
            id: fileId,
            filename,
            path,
            size,
            status: 'pending',
          })

          resolve(response.ok(file))
        } catch (error) {
          body.destroy()
          logger.error({ error }, 'File upload failed')
          reject(error)
        }
      })

      multipart.process().catch((error: Error) => {
        clearTimeout(timeout)
        logger.error({ error }, 'Multipart processing error')
        reject(error)
      })
    })
  }
}
