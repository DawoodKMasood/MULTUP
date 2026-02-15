import type { HttpContext } from '@adonisjs/core/http'
import Mirror from '#models/mirror'
import FileMirror from '#models/file_mirror'
import cache from '@adonisjs/cache/services/main'
import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'

interface MirrorStatusData {
  id: string
  name: string
  status24h: number
  status1h: number
  logo: string | null
}

interface StatusResponse {
  mirrors: MirrorStatusData[]
  cachedAt: string
}

export default class StatusController {
  async index({ inertia, response }: HttpContext) {
    try {
      const cacheKey = 'status:page:v1'
      let result: StatusResponse

      try {
        result = await cache.getOrSet({
          key: cacheKey,
          ttl: '10m',
          factory: async (): Promise<StatusResponse> => {
            return await this.fetchStatusData()
          },
        })
      } catch (cacheError) {
        logger.warn({ error: String(cacheError) }, 'Cache failed, falling back to database')
        result = await this.fetchStatusData()
      }

      return inertia.render('status', result)
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        type: error?.constructor?.name || typeof error,
      }, 'Failed to fetch mirror status data')
      return response.internalServerError({ error: 'Failed to load status data' })
    }
  }

  private async calculateMirrorStats(
    mirrorIds: string[],
    since: DateTime
  ): Promise<Map<string, number>> {
    if (mirrorIds.length === 0) {
      return new Map()
    }

    const sinceSQL = since.toSQL()
    if (!sinceSQL) {
      return new Map()
    }

    const fileMirrors = await FileMirror.query()
      .whereIn('mirror_id', mirrorIds)
      .where('created_at', '>=', sinceSQL)
      .select('mirror_id', 'status')

    const statsByMirror = new Map<string, { total: number; done: number }>()

    for (const fm of fileMirrors) {
      if (!fm.mirrorId) continue
      const current = statsByMirror.get(fm.mirrorId) || { total: 0, done: 0 }
      current.total++
      if (fm.status === 'done') {
        current.done++
      }
      statsByMirror.set(fm.mirrorId, current)
    }

    const result = new Map<string, number>()
    for (const [mirrorId, stats] of statsByMirror) {
      const percentage = stats.total > 0 ? (stats.done / stats.total) * 100 : 0
      result.set(mirrorId, Math.round(percentage * 100) / 100)
    }

    return result
  }

  private async fetchStatusData(): Promise<StatusResponse> {
    const mirrors = await Mirror.query().where('enabled', true).orderBy('priority', 'asc')

    const now = DateTime.utc()
    const twentyFourHoursAgo = now.minus({ hours: 24 })
    const oneHourAgo = now.minus({ hours: 1 })

    const mirrorIds = mirrors.map((m) => m.id)

    if (mirrorIds.length === 0) {
      return {
        mirrors: [],
        cachedAt: now.toISO() || '',
      }
    }

    const stats24h = await this.calculateMirrorStats(mirrorIds, twentyFourHoursAgo)
    const stats1h = await this.calculateMirrorStats(mirrorIds, oneHourAgo)

    const mirrorStatusData: MirrorStatusData[] = mirrors.map((mirror) => ({
      id: mirror.id,
      name: mirror.name,
      status24h: stats24h.get(mirror.id) ?? 100,
      status1h: stats1h.get(mirror.id) ?? 100,
      logo: mirror.logo,
    }))

    return {
      mirrors: mirrorStatusData,
      cachedAt: now.toISO() || '',
    }
  }
}
