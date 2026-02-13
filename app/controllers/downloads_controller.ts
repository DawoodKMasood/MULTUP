import type { HttpContext } from '@adonisjs/core/http'
import File from '#models/file'
import FileMirror from '#models/file_mirror'
import { DateTime } from 'luxon'
import vine from '@vinejs/vine'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'

interface MirrorData {
  id: string
  name: string
  status: string
  expiresAt: string | null
}

interface FileData {
  id: string
  filename: string
  size: number
  mimeType: string | null
  createdAt: string
  status: string
}

interface FileStatusResponse {
  file: FileData
  mirrors: MirrorData[]
}

const showParamsValidator = vine.compile(
  vine.object({
    fileId: vine.string().uuid(),
  })
)

const redirectParamsValidator = vine.compile(
  vine.object({
    fileId: vine.string().uuid(),
    mirrorId: vine.string().uuid(),
  })
)

export default class DownloadsController {
  async show({ params, inertia, response }: HttpContext) {
    let validatedParams: { fileId: string }
    try {
      validatedParams = await showParamsValidator.validate(params)
    } catch (error) {
      return response.badRequest({ error: 'Invalid file ID format' })
    }

    const { fileId } = validatedParams

    try {
      const file = await File.query().where('id', fileId).first()

      if (!file) {
        return inertia.render('errors/not_found', { message: 'File not found' })
      }

      const fileMirrors = await FileMirror.query()
        .where('file_id', fileId)
        .orderBy('created_at', 'asc')

      const mirrors: MirrorData[] = fileMirrors.map((mirror) => {
        const isExpired = mirror.expiresAt && mirror.expiresAt < DateTime.utc()
        const displayStatus = isExpired ? 'expired' : mirror.status

        return {
          id: mirror.id,
          name: mirror.mirror,
          status: displayStatus,
          expiresAt: mirror.expiresAt?.toISO() || null,
        }
      })

      const fileData: FileData = {
        id: file.id,
        filename: file.filename,
        size: file.size,
        mimeType: file.mimeType,
        createdAt: file.createdAt.toISO() || '',
        status: file.status,
      }

      const result = { file: fileData, mirrors }

      return inertia.render('download', {
        file: result.file,
        mirrors: result.mirrors,
      })
    } catch (error) {
      logger.error({ fileId, error }, 'Failed to fetch file download data')
      return response.internalServerError({ error: 'Failed to load download data' })
    }
  }

  async status({ params, response }: HttpContext) {
    let validatedParams: { fileId: string }
    try {
      validatedParams = await showParamsValidator.validate(params)
    } catch (error) {
      return response.badRequest({ error: 'Invalid file ID format' })
    }

    const { fileId } = validatedParams

    try {
      const file = await File.query().where('id', fileId).first()

      if (!file) {
        return response.notFound({ error: 'File not found' })
      }

      const fileMirrors = await FileMirror.query()
        .where('file_id', fileId)
        .orderBy('created_at', 'asc')

      const mirrors: MirrorData[] = fileMirrors.map((mirror) => {
        const isExpired = mirror.expiresAt && mirror.expiresAt < DateTime.utc()
        const displayStatus = isExpired ? 'expired' : mirror.status

        return {
          id: mirror.id,
          name: mirror.mirror,
          status: displayStatus,
          expiresAt: mirror.expiresAt?.toISO() || null,
        }
      })

      const fileData: FileData = {
        id: file.id,
        filename: file.filename,
        size: file.size,
        mimeType: file.mimeType,
        createdAt: file.createdAt.toISO() || '',
        status: file.status,
      }

      const result: FileStatusResponse = { file: fileData, mirrors }

      return response.json(result)
    } catch (error) {
      logger.error({ fileId, error }, 'Failed to fetch file status')
      return response.internalServerError({ error: 'Failed to fetch file status' })
    }
  }

  async redirectToMirror({ params, inertia, response }: HttpContext) {
    let validatedParams: { fileId: string; mirrorId: string }
    try {
      validatedParams = await redirectParamsValidator.validate(params)
    } catch (error) {
      return response.badRequest({ error: 'Invalid file or mirror ID format' })
    }

    const { fileId, mirrorId } = validatedParams

    try {
      const result = await db.transaction(async (trx) => {
        const file = await File.query({ client: trx }).where('id', fileId).first()

        if (!file) {
          return { notFound: true, message: 'File not found' }
        }

        const fileMirror = await FileMirror.query({ client: trx })
          .where('id', mirrorId)
          .where('file_id', fileId)
          .first()

        if (!fileMirror) {
          return { notFound: true, message: 'Mirror not found' }
        }

        if (fileMirror.status !== 'done' || !fileMirror.url) {
          return { notAvailable: true, message: 'Mirror not available' }
        }

        const isExpired = fileMirror.expiresAt && fileMirror.expiresAt < DateTime.utc()
        if (isExpired) {
          return { expired: true, message: 'Mirror link has expired' }
        }

        const fileData = {
          id: file.id,
          filename: file.filename,
        }

        const mirrorData = {
          id: fileMirror.id,
          name: fileMirror.mirror,
        }

        return {
          file: fileData,
          mirror: mirrorData,
          mirrorUrl: fileMirror.url,
        }
      })

      if (result.notFound) {
        return inertia.render('errors/not_found', { message: result.message })
      }

      if (result.notAvailable) {
        return inertia.render('errors/server_error', { message: result.message })
      }

      if (result.expired) {
        return inertia.render('errors/server_error', { message: result.message })
      }

      return inertia.render('mirror_download', {
        file: result.file,
        mirror: result.mirror,
        mirrorUrl: result.mirrorUrl,
      })
    } catch (error) {
      logger.error({ fileId, mirrorId, error }, 'Failed to fetch mirror redirect data')
      return response.internalServerError({ error: 'Failed to load mirror data' })
    }
  }
}
