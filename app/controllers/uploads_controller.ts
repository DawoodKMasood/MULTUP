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
const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

type MultipartStream = NodeJS.ReadableStream & {
  filename?: string
  headers: Record<string, string | string[] | undefined>
}

export default class UploadsController {
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
    let uploadError: Error | null = null

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!fileProcessed) {
          uploadError = new Error('Upload timeout: No file received within 5 minutes')
          resolve(response.status(408).send({ error: uploadError.message }))
        }
      }, UPLOAD_TIMEOUT_MS)

      multipart.onFile('file', {}, async (part: MultipartStream) => {
        fileProcessed = true
        clearTimeout(timeout)
        const body = new PassThrough()

        try {
          if (!part.filename) {
            body.destroy()
            resolve(response.status(400).send({ error: 'Filename is required' }))
            return
          }

          if (part.filename.trim() === '') {
            body.destroy()
            resolve(response.status(400).send({ error: 'Filename cannot be empty' }))
            return
          }

          const contentType = part.headers['content-type']
          const mimeType = Array.isArray(contentType) ? contentType[0] : contentType

          if (!mimeType) {
            body.destroy()
            resolve(response.status(400).send({ error: 'Content-Type header is missing' }))
            return
          }

          if (!ALLOWED_MIME_TYPES.some(type => mimeType.startsWith(type))) {
            body.destroy()
            resolve(response.status(415).send({
              error: `Invalid file type: ${mimeType}`,
              allowedTypes: ALLOWED_MIME_TYPES,
            }))
            return
          }

          const fileId = randomUUID()
          const originalFilename = part.filename
          const filename = `${fileId}_${originalFilename}`
          const now = new Date()
          const year = now.getFullYear()
          const month = String(now.getMonth() + 1).padStart(2, '0')
          const day = String(now.getDate()).padStart(2, '0')
          const path = `uploads/${year}/${month}/${day}/${filename}`
          let size = 0
          let sizeExceeded = false

          part.on('data', (chunk: Buffer) => {
            size += chunk.length
            if (size > MAX_FILE_SIZE && !sizeExceeded) {
              sizeExceeded = true
              body.destroy()
              uploadError = new Error(`File size exceeds maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`)
              resolve(response.status(413).send({ error: uploadError.message }))
            }
          })

          part.on('error', (error: unknown) => {
            body.destroy()
            logger.error({ error }, 'Stream error during file upload')
            uploadError = error instanceof Error ? error : new Error(String(error))
            resolve(response.status(500).send({ error: 'File stream error occurred' }))
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

          if (size === 0) {
            body.destroy()
            resolve(response.status(400).send({ error: 'Empty files are not allowed' }))
            return
          }

          const file = await File.create({
            id: fileId,
            filename,
            path,
            size,
            status: 'pending',
          })

          resolve(response.status(201).send(file))
        } catch (error) {
          body.destroy()
          logger.error({ error }, 'File upload failed')
          uploadError = error instanceof Error ? error : new Error(String(error))
          resolve(response.status(500).send({ error: 'Internal server error during upload' }))
        }
      })

      multipart.process().then(() => {
        clearTimeout(timeout)
        if (!fileProcessed && !uploadError) {
          resolve(response.status(400).send({ error: 'No file uploaded. Expected field: "file"' }))
        }
      }).catch((error: Error) => {
        clearTimeout(timeout)
        logger.error({ error }, 'Multipart processing error')
        resolve(response.status(400).send({ error: 'Failed to process multipart request' }))
      })
    })
  }
}
