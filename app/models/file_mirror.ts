import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import File from './file.js'

export type MirrorStatus = 'queued' | 'uploading' | 'done' | 'failed'

export default class FileMirror extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column({ columnName: 'file_id' })
  declare fileId: string

  @column()
  declare mirror: string

  @column()
  declare status: MirrorStatus

  @column()
  declare url: string | null

  @column()
  declare attempts: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => File)
  declare file: BelongsTo<typeof File>
}
