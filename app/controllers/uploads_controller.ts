import type { HttpContext } from '@adonisjs/core/http'
import { Upload } from '@aws-sdk/lib-storage'
import { randomUUID } from 'node:crypto'
import { PassThrough } from 'node:stream'
import env from '#start/env'
import s3Client from '#services/s3_client'
import File from '#models/file'

type MultipartStream = NodeJS.ReadableStream & {
  filename?: string
  headers: Record<string, string | string[] | undefined>
}

export default class UploadsController {
  async store({ request, response }: HttpContext) {
    const multipart = request.multipart

    return new Promise((resolve, reject) => {
      multipart.onFile('file', {}, async (part: MultipartStream) => {
        try {
          const filename = `${part.filename || 'file_' + new Date().toISOString().replace(/[:.]/g, '-')}`
          const fileId = randomUUID()
          const now = new Date()
          const year = now.getFullYear()
          const month = String(now.getMonth() + 1).padStart(2, '0')
          const day = String(now.getDate()).padStart(2, '0')
          const path = `uploads/${year}/${month}/${day}/${fileId}`
          const body = new PassThrough()
          let size = 0

          part.on('data', (chunk: Buffer) => {
            size += chunk.length
          })
          part.on('error', (error: unknown) => reject(error))
          part.pipe(body)

          const contentType = part.headers['content-type']

          const upload = new Upload({
            client: s3Client,
            params: {
              Bucket: env.get('S3_BUCKET'),
              Key: path,
              Body: body,
              ContentType: Array.isArray(contentType) ? contentType[0] : contentType,
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
          reject(error)
        }
      })

      multipart.process()
    })
  }
}
