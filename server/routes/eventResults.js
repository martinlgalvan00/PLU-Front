import { z } from 'zod'
import { toPublicMeetSheet } from '../../shared/publicMeetSheet.js'
import { HttpError } from '../lib/errors.js'
import { assertEventAccess } from '../lib/eventScope.js'
import { PUBLIC_CACHE_SECONDS, publicReadCache } from '../lib/http.js'
import { requireSupabaseClient } from '../lib/supabaseRpc.js'
import { validateBody } from '../lib/validate.js'
import { requirePermission } from '../middleware/auth.js'
import { publicReadLimiter, staffLimiter } from '../middleware/rateLimit.js'
import {
  listPublishedMeetSlugs,
  loadSiteEvent,
  matchAthleteGyms,
  readMeetSheet,
  replaceMeetSheet,
} from '../services/eventMeetResults.js'
import { awardsForRows, parseLiftingCastCsv } from '../services/liftingResultImport.js'

const importSchema = z.object({
  csv: z.string().min(1, 'Falta el archivo.').max(700_000, 'El archivo supera el tamaño permitido.'),
  apply: z.boolean().optional(),
})

function parsePublicSlug(value) {
  const slug = String(value ?? '').trim()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new HttpError(400, 'Slug de evento inválido.')
  }
  return slug
}

function toAwardRow(row) {
  return {
    athleteName: row.athleteName,
    sex: row.sex,
    age: row.age,
    division: row.division,
    bodyweightKg: row.bodyweightKg,
    totalKg: row.totalKg,
    teamName: row.teamName,
    equipment: row.equipment,
    place: row.place,
  }
}

function sheetPayload(rows, { preview = false, imported = 0, errors = [] } = {}) {
  return {
    preview,
    imported,
    errors,
    rows: rows.map(toAwardRow),
    awards: awardsForRows(rows),
  }
}

export function registerEventResultRoutes(router, { prisma, getSupabaseAdmin }) {
  const readGuard = requirePermission('admin.results.read', { prisma })
  const writeGuard = requirePermission('admin.results.write', { prisma })

  router.get('/results/published', publicReadLimiter, async (_req, res, next) => {
    try {
      const client = requireSupabaseClient(getSupabaseAdmin())
      const slugs = await listPublishedMeetSlugs(client)
      res.set('Cache-Control', publicReadCache(PUBLIC_CACHE_SECONDS.CATALOG))
      res.json({ slugs })
    } catch (error) {
      next(error)
    }
  })

  router.get('/:eventSlug/results/public', publicReadLimiter, async (req, res, next) => {
    try {
      const slug = parsePublicSlug(req.params.eventSlug)
      const client = requireSupabaseClient(getSupabaseAdmin())
      const event = await loadSiteEvent(client, slug)
      if (event.published !== true) {
        res.set('Cache-Control', 'no-store')
        throw new HttpError(404, 'No encontramos esa planilla.')
      }
      const rows = await readMeetSheet(client, event.id)
      if (!rows.length) {
        res.set('Cache-Control', 'no-store')
        throw new HttpError(404, 'No encontramos esa planilla.')
      }
      res.set('Cache-Control', publicReadCache(PUBLIC_CACHE_SECONDS.CATALOG))
      res.json(toPublicMeetSheet({ title: event.title, rows }))
    } catch (error) {
      next(error)
    }
  })

  router.get('/:eventSlug/results', ...readGuard, staffLimiter, async (req, res, next) => {
    try {
      const slug = parsePublicSlug(req.params.eventSlug)
      const client = requireSupabaseClient(getSupabaseAdmin())
      const event = await loadSiteEvent(client, slug)
      assertEventAccess(req, { eventId: event.id, slug: event.slug })
      const rows = await readMeetSheet(client, event.id)
      res.json(sheetPayload(rows))
    } catch (error) {
      next(error)
    }
  })

  router.post(
    '/:eventSlug/results/import',
    ...writeGuard,
    staffLimiter,
    validateBody(importSchema),
    async (req, res, next) => {
      try {
        const slug = parsePublicSlug(req.params.eventSlug)
        const client = requireSupabaseClient(getSupabaseAdmin())
        const event = await loadSiteEvent(client, slug)
        assertEventAccess(req, { eventId: event.id, slug: event.slug })
        const parsed = parseLiftingCastCsv(req.validatedBody.csv)
        const matched = await matchAthleteGyms(client, parsed.rows)
        if (!req.validatedBody.apply) {
          res.json(sheetPayload(matched, { preview: true, errors: parsed.errors }))
          return
        }
        if (!matched.length) {
          throw new HttpError(400, 'No hay filas válidas para guardar.')
        }
        const imported = await replaceMeetSheet(client, event.id, matched)
        res.json(sheetPayload(matched, { imported, errors: parsed.errors }))
      } catch (error) {
        next(error)
      }
    },
  )
}
