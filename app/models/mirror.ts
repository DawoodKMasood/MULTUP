import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import FileMirror from './file_mirror.js'

export default class Mirror extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare name: string

  @column()
  declare config: Record<string, unknown> | null

  @column()
  declare enabled: boolean

  @column()
  declare priority: number

  @column()
  declare logo: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @hasMany(() => FileMirror)
  declare fileMirrors: HasMany<typeof FileMirror>
}
