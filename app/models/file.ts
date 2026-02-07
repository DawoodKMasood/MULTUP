import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import FileMirror from './file_mirror.js'

export default class File extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare filename: string

  @column()
  declare size: number

  @column()
  declare path: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @hasMany(() => FileMirror)
  declare mirrors: HasMany<typeof FileMirror>
}
