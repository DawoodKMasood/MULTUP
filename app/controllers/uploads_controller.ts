import { cuid } from '@adonisjs/core/helpers'
import type { HttpContext } from '@adonisjs/core/http'
import File from '#models/file'
import db from '@adonisjs/lucid/services/db'
import drive from '@adonisjs/drive/services/main'

export default class UploadsController {
    async store({ request, response }: HttpContext) {
        
        const file = request.file('file', {
            size: '10mb'
        })

        if (!file) {
            return response.badRequest({ error: 'File missing' })
        }

        if (!file.clientName) {
            return response.badRequest({ error: 'File name is missing' })
        }

        if (!file.size) {
            return response.badRequest({ error: 'Empty file' })
        }

        if (!file.isValid) {
            return response.badRequest({ error: 'File is not valid' })
        }
        
        if (!file.tmpPath) {
            return response.badRequest({ error: 'File is not uploaded' })
        }

        if (file.hasErrors) {
            return response.badRequest({ error: 'File has errors' })
        }
        
        const id = cuid();
        const key = `uploads/${id}.${file.extname}`

        const trx = await db.transaction()

        try {
            await file.moveToDisk(key)
            
            const fileRecord = await File.create({
                filename: file.clientName,
                size: file.size,
                path: key,
            }, { client: trx })

            await trx.commit()

            return response.json(fileRecord)
        } catch (error) {
            await trx.rollback()
            
            try {
                await drive.use().delete(key)
            } catch (_) {
                return response.internalServerError({ 
                    error: 'File upload failed',
                    message: 'Failed to clean up file'
                })
            }
            
            return response.internalServerError({ 
                error: 'File upload failed',
                message: 'Failed to save file'
            })
        }
    }
}