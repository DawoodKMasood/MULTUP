import { cuid } from '@adonisjs/core/helpers'
import type { HttpContext } from '@adonisjs/core/http'
import File from '#models/file'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import queue from '@rlanz/bull-queue/services/main'
import MirrorFileJob from '#jobs/mirror_file_job'
import uploadConfig from '#config/upload'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { createReadStream } from 'node:fs'
import env from '#start/env'

const s3Client = new S3Client({
  region: env.get('AWS_REGION'),
  endpoint: env.get('AWS_ENDPOINT'),
  credentials: {
    accessKeyId: env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: env.get('AWS_SECRET_ACCESS_KEY'),
  },
})

const BUCKET = env.get('S3_BUCKET')

export default class UploadsController {
    async store({ request, response }: HttpContext) {
        
        const file = request.file('file', {
            size: '100mb'
        })

        if (!file || !file.isValid || file.hasErrors) {
            return response.badRequest({
                error: 'File missing or invalid',
                details: file?.errors
            })
        }

        if (!file.clientName) {
            return response.badRequest({ error: 'File name is missing' })
        }

        if (!file.size) {
            return response.badRequest({ error: 'File is empty' })
        }

        if (!file.tmpPath) {
            return response.badRequest({ error: 'File is not uploaded' })
        }

        const mimeType = file.headers['content-type'] || 'application/octet-stream'
        const isAllowedType = uploadConfig.allowedMimeTypes.some(allowed =>
            mimeType.toLowerCase().startsWith(allowed.toLowerCase())
        )
        if (!isAllowedType) {
            return response.badRequest({
                error: 'File type not allowed',
                mimeType
            })
        }

        const id = cuid()
        const ext = file.extname ? file.extname.replace(/^\./, '').toLowerCase() : 'bin'
        const validExtPattern = /^[a-z0-9]+$/
        if (!validExtPattern.test(ext)) {
            return response.badRequest({ error: 'Invalid file extension' })
        }
        const key = `uploads/${id}.${ext}`

        const trx = await db.transaction()

        try {
            const fileStream = createReadStream(file.tmpPath!)
            await s3Client.send(new PutObjectCommand({
              Bucket: BUCKET,
              Key: key,
              Body: fileStream,
              ContentType: mimeType,
            }))
            
            const fileRecord = await File.create({
                filename: file.clientName,
                size: file.size,
                status: 'pending',
                mimeType,
                path: key,
            }, { client: trx })

            await trx.commit()

            try {
                await queue.dispatch(MirrorFileJob, { fileId: fileRecord.id })
            } catch (queueError) {
                logger.error({ fileId: fileRecord.id, error: queueError }, 'Queue dispatch failed')
            }

            return response.json(
                {
                    id: fileRecord.id,
                    filename: fileRecord.filename,
                    status: fileRecord.status,
                    message: 'File uploaded successfully'
                }
            )
        } catch (error) {
            await trx.rollback()
            
            try {
                await s3Client.send(new DeleteObjectCommand({
                  Bucket: BUCKET,
                  Key: key,
                }))
            } catch (cleanupError) {
                logger.error('S3 cleanup failed in uploads_controller (store):', cleanupError)
            }
            
            return response.internalServerError({
                error: 'File upload failed',
                message: 'Unable to save file'
            })
        }
    }
}