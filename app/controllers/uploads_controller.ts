import { cuid } from '@adonisjs/core/helpers'
import type { HttpContext } from '@adonisjs/core/http'
import File from '#models/file'
import logger from '@adonisjs/core/services/logger'
import queue from '@rlanz/bull-queue/services/main'
import MirrorFileJob from '#jobs/mirror_file_job'
import uploadConfig from '#config/upload'
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import env from '#start/env'

const s3Client = new S3Client({
  region: env.get('AWS_REGION'),
  endpoint: env.get('AWS_ENDPOINT'),
  credentials: {
    accessKeyId: env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: env.get('AWS_SECRET_ACCESS_KEY'),
  },
  forcePathStyle: true,
})

const BUCKET = env.get('S3_BUCKET')
const PRESIGNED_URL_EXPIRY_SECONDS = 900 // 15 minutes
const SIZE_TOLERANCE_BYTES = 1024

interface ValidationError {
  error: string
  details?: Record<string, unknown>
}

type ValidationResult = { valid: true } | { valid: false; error: ValidationError }

const EXT_TO_MIME_TYPE: Record<string, string[]> = {
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  gif: ['image/gif'],
  webp: ['image/webp'],
  svg: ['image/svg+xml'],
  mp4: ['video/mp4'],
  webm: ['video/webm'],
  mov: ['video/quicktime'],
  pdf: ['application/pdf'],
  zip: ['application/zip', 'application/x-zip-compressed', 'application/x-zip'],
  txt: ['text/plain'],
  md: ['text/markdown', 'text/plain'],
  csv: ['text/csv', 'text/plain'],
  json: ['application/json', 'text/plain'],
  bin: ['application/octet-stream'],
}

function getFileExtension(filename: string): string {
  const match = filename.match(/\.([a-z0-9]+)$/i)
  return match?.[1]?.toLowerCase() || 'bin'
}

function isMimeTypeAllowed(mimeType: string): boolean {
  return uploadConfig.allowedMimeTypes.some(allowed =>
    mimeType.toLowerCase().startsWith(allowed.toLowerCase())
  )
}

function validateExtensionMimeTypeMatch(ext: string, mimeType: string): boolean {
  const allowedTypes = EXT_TO_MIME_TYPE[ext.toLowerCase()]
  if (!allowedTypes) {
    return mimeType.toLowerCase() === 'application/octet-stream'
  }
  return allowedTypes.some(type => {
    const normalized = mimeType.toLowerCase()
    return normalized === type || normalized.startsWith(`${type};`)
  })
}

function sanitizeMetadata(value: string): string {
  return value.replace(/[\r\n\x00-\x1F\x7F]/g, '')
}

async function deleteS3Object(key: string): Promise<void> {
  await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

function validatePresignRequest(body: Record<string, unknown>): ValidationResult {
  const { filename, size, mimeType } = body

  if (!filename || typeof filename !== 'string') {
    return { valid: false, error: { error: 'Filename is required' } }
  }

  if (typeof size !== 'number' || size <= 0) {
    return { valid: false, error: { error: 'Size must be greater than 0' } }
  }

  if (size > uploadConfig.maxFileSize) {
    return {
      valid: false,
      error: { error: 'File size exceeds maximum allowed', details: { maxSize: uploadConfig.maxFileSize } },
    }
  }

  const finalMimeType = (mimeType as string || 'application/octet-stream').toLowerCase()
  if (!isMimeTypeAllowed(finalMimeType)) {
    return { valid: false, error: { error: 'File type not allowed', details: { mimeType } } }
  }

  const ext = getFileExtension(filename)
  if (!/^[a-z0-9]+$/.test(ext)) {
    return { valid: false, error: { error: 'Invalid file extension' } }
  }

  if (!validateExtensionMimeTypeMatch(ext, finalMimeType)) {
    return {
      valid: false,
      error: { error: `File extension '.${ext}' does not match MIME type '${finalMimeType}'` },
    }
  }

  return { valid: true }
}

interface UploadMetadata {
  filename: string
  size: number
  mimeType: string
  id: string
}

function extractAndValidateMetadata(metadata: Record<string, string>): ValidationResult | UploadMetadata {
  const filename = metadata['x-amz-meta-filename']
  const sizeStr = metadata['x-amz-meta-declared-size']
  const mimeType = metadata['x-amz-meta-declared-mimetype']
  const id = metadata['x-amz-meta-upload-id']

  if (!filename || !sizeStr || !mimeType || !id) {
    return { valid: false, error: { error: 'Invalid upload: metadata missing' } }
  }

  const size = parseInt(sizeStr, 10)
  if (isNaN(size) || size <= 0) {
    return { valid: false, error: { error: 'Invalid approved size in metadata' } }
  }

  return { filename, size, mimeType, id }
}

export default class UploadsController {
    async generatePresignedUrl({ request, response }: HttpContext) {
        const validation = validatePresignRequest(request.body())
        if (!validation.valid) {
            return response.badRequest(validation.error)
        }

        const { filename, mimeType, size } = request.body()
        const finalMimeType = (mimeType as string || 'application/octet-stream').toLowerCase()
        const ext = getFileExtension(filename as string)
        const id = cuid()
        const key = `uploads/${id}.${ext}`
        const sanitizedFilename = sanitizeMetadata(filename as string)

        try {
            const command = new PutObjectCommand({
                Bucket: BUCKET,
                Key: key,
                ContentType: finalMimeType,
                Metadata: {
                    'x-amz-meta-filename': sanitizedFilename,
                    'x-amz-meta-declared-size': String(size),
                    'x-amz-meta-declared-mimetype': finalMimeType,
                    'x-amz-meta-upload-id': id,
                },
            })

            const url = await getSignedUrl(s3Client, command, { expiresIn: PRESIGNED_URL_EXPIRY_SECONDS })

            return response.json({
                id,
                url,
                key,
                filename: sanitizedFilename,
                mimeType: finalMimeType,
                size,
                expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
            })
        } catch (error) {
            logger.error({ error, filename }, 'Failed to generate presigned URL')
            return response.internalServerError({ error: 'Failed to generate upload URL' })
        }
    }

    async completeUpload({ request, response }: HttpContext) {
        const { key } = request.body()

        if (!key || typeof key !== 'string' || !key.startsWith('uploads/') || key.includes('..')) {
            return response.badRequest({ error: 'Invalid or missing S3 key' })
        }

        try {
            const headResult = await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
            const metadataResult = extractAndValidateMetadata(headResult.Metadata || {})

            if ('valid' in metadataResult && !metadataResult.valid) {
                logger.warn({ key }, 'S3 object missing required metadata - possible direct upload bypass')
                return response.badRequest(metadataResult.error)
            }

            const approved = metadataResult as UploadMetadata
            const actualSize = headResult.ContentLength
            const actualMimeType = headResult.ContentType?.toLowerCase() || 'application/octet-stream'

            if (actualSize === undefined || actualSize === null) {
                return response.badRequest({ error: 'Could not determine actual file size' })
            }

            const sizeDiff = Math.abs(actualSize - approved.size)
            if (sizeDiff > SIZE_TOLERANCE_BYTES) {
                logger.warn({ key, actualSize, approvedSize: approved.size, difference: sizeDiff }, 'File size mismatch')
                await deleteS3Object(key)
                return response.badRequest({
                    error: 'File size does not match declared size',
                    actualSize,
                    declaredSize: approved.size,
                })
            }

            if (actualMimeType !== approved.mimeType) {
                logger.warn({ key, actualMimeType, approvedMimeType: approved.mimeType }, 'MIME type mismatch')
                await deleteS3Object(key)
                return response.badRequest({
                    error: 'MIME type does not match declared type',
                    actualMimeType,
                    declaredMimeType: approved.mimeType,
                })
            }

            if (!isMimeTypeAllowed(actualMimeType)) {
                await deleteS3Object(key)
                return response.badRequest({ error: 'File type not allowed' })
            }

            if (actualSize > uploadConfig.maxFileSize) {
                await deleteS3Object(key)
                return response.badRequest({ error: 'File size exceeds maximum allowed', maxSize: uploadConfig.maxFileSize })
            }

            const fileRecord = await File.create({
                filename: approved.filename,
                size: actualSize,
                status: 'pending',
                mimeType: actualMimeType,
                path: key,
            })

            try {
                await queue.dispatch(MirrorFileJob, { fileId: fileRecord.id })
            } catch (queueError) {
                logger.error({ fileId: fileRecord.id, error: queueError }, 'Queue dispatch failed')
            }

            return response.json({
                id: fileRecord.id,
                filename: fileRecord.filename,
                size: actualSize,
                mimeType: actualMimeType,
                status: fileRecord.status,
                message: 'File upload completed successfully',
            })
        } catch (error: any) {
            if (error.name === 'NotFound' || error.name === 'NoSuchKey') {
                return response.badRequest({ error: 'File not found in storage' })
            }
            logger.error({ error, key }, 'Failed to complete upload')
            return response.internalServerError({ error: 'Failed to complete upload' })
        }
    }
}
