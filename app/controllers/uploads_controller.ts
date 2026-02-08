import { cuid } from '@adonisjs/core/helpers'
import type { HttpContext } from '@adonisjs/core/http'
import File from '#models/file'
import db from '@adonisjs/lucid/services/db'
import drive from '@adonisjs/drive/services/main'
import logger from '@adonisjs/core/services/logger'

export default class UploadsController {
    async store({ request, response }: HttpContext) {
        
        const file = request.file('file', {
            size: '10mb'
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
        
        const id = cuid();
        const ext = file.extname?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'bin'
        const key = `uploads/${id}.${ext}`

        const trx = await db.transaction()

        try {
            await file.moveToDisk(key)
            
            const fileRecord = await File.create({
                filename: file.clientName,
                size: file.size,
                status: 'pending',
                path: key,
            }, { client: trx })

            await trx.commit()

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
                await drive.use().delete(key)
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