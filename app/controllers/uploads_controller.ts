import { cuid } from '@adonisjs/core/helpers'
import type { HttpContext } from '@adonisjs/core/http'
import File from '#models/file'
import logger from '@adonisjs/core/services/logger'
import queue from '@rlanz/bull-queue/services/main'
import MirrorFileJob from '#jobs/mirror_file_job'
import uploadConfig from '#config/upload'
import { PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import s3Client, { BUCKET } from '#services/s3_client'
import {
  getFileExtension,
  isMimeTypeAllowed,
  validateExtensionMimeTypeMatch,
  sanitizeMetadata,
  isValidExtensionFormat,
} from '#services/file_validation'
import { deleteS3Object } from '#services/s3_operations'
import type { ValidationResult } from '#services/validation'
import { validateFileSize, validateRequiredString, failure } from '#services/validation'

const PRESIGNED_URL_EXPIRY_SECONDS = 300 // 5 minutes
const SIZE_TOLERANCE_BYTES = 1024

interface UploadMetadata {
  filename: string
  size: number
  mimeType: string
  id: string
}

function validatePresignRequest(body: Record<string, unknown>): ValidationResult {
  const { filename, size, mimeType } = body

  const filenameValidation = validateRequiredString(filename, 'Filename')
  if (!filenameValidation.valid) return filenameValidation

  const sizeValidation = validateFileSize(size as number)
  if (!sizeValidation.valid) return sizeValidation

  const finalMimeType = (mimeType as string || 'application/octet-stream').toLowerCase()
  if (!isMimeTypeAllowed(finalMimeType)) {
    return failure('File type not allowed', { mimeType })
  }

  const ext = getFileExtension(filename as string)
  if (!isValidExtensionFormat(ext)) {
    return failure('Invalid file extension')
  }

  if (!validateExtensionMimeTypeMatch(ext, finalMimeType)) {
    return failure(`File extension '.${ext}' does not match MIME type '${finalMimeType}'`)
  }

  return { valid: true }
}

function extractAndValidateMetadata(metadata: Record<string, string>): ValidationResult | UploadMetadata {
  const filename = metadata['x-amz-meta-filename']
  const sizeStr = metadata['x-amz-meta-declared-size']
  const mimeType = metadata['x-amz-meta-declared-mimetype']
  const id = metadata['x-amz-meta-upload-id']

  if (!filename || !sizeStr || !mimeType || !id) {
    return failure('Invalid upload: metadata missing')
  }

  const size = parseInt(sizeStr, 10)
  if (isNaN(size) || size <= 0) {
    return failure('Invalid approved size in metadata')
  }

  return { filename, size, mimeType, id }
}

function isValidS3Key(key: unknown): key is string {
  return typeof key === 'string' && key.startsWith('uploads/') && !key.includes('..')
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

    if (!isValidS3Key(key)) {
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
