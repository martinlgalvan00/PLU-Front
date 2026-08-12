import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../lib/errors.js'
import { validateBody } from '../lib/validate.js'
import { requirePermission } from '../middleware/auth.js'
import { analyticsIngestLimiter, staffLimiter } from '../middleware/rateLimit.js'
import { createSupabaseAnalyticsRepository } from '../modules/analytics/supabaseAnalyticsRepository.js'
import { normalizePath, normalizeReferrerHost } from '../modules/analytics/normalizePath.js'
import { describeUserAgent, resolveVisitorId } from '../modules/analytics/visitorIdentity.js'
import { ATHLETE_SESSION_COOKIE_NAME, readAthleteSession } from '../services/athleteSessionService.js'

/**
 * analytics.js — PLU ARG
 *
 * Analitica de uso del sitio: cuanta gente entra, por donde navega, donde
 * clickea y donde abandona el embudo de afiliacion.
 *
 * Es un dominio separado de `/api/audit`, que audita los efectos de negocio
 * (cobros, activaciones, credenciales). Aca el volumen es varios ordenes de
 * magnitud mayor y cada fila vale poco; mezclarlos degradaria la bitacora que
 * sostiene los reclamos de dinero.
 *
 * Dos decisiones que el endpoint no delega en el navegador:
 *   - El identificador de visitante se deriva en el servidor. Uno generado por
 *     el cliente es trivial de falsear y con el se inflan las visitas.
 *   - La ruta se normaliza en el servidor. Es la clave de agregacion de todo el
 *     informe.
 */

// Pasos canonicos del embudo de afiliacion. Viven aca para que el panel no
// pueda pedir un embudo con nombres que el tracker nunca emite.
export const MEMBERSHIP_FUNNEL_STEPS = Object.freeze([
  'landing_view',
  'membership_view',
  'membership_checkout_opened',
  'payment_submitted',
  'payment_approved',
])

const eventSchema = z.object({
  type: z.enum([
    'pageview', 'click', 'scroll', 'form_start', 'form_submit', 'form_error',
    'conversion', 'search', 'outbound', 'error', 'custom',
  ]),
  path: z.string().trim().max(500).optional(),
  route: z.string().trim().max(200).optional(),
  title: z.string().trim().max(200).optional(),
  selector: z.string().trim().max(300).optional(),
  text: z.string().trim().max(120).optional(),
  x: z.coerce.number().min(0).max(1).optional(),
  y: z.coerce.number().min(0).max(1).optional(),
  viewportWidth: z.coerce.number().int().min(0).max(20000).optional(),
  viewportHeight: z.coerce.number().int().min(0).max(20000).optional(),
  scrollDepth: z.coerce.number().min(0).max(1).optional(),
  name: z.string().trim().max(80).optional(),
  value: z.coerce.number().optional(),
  metadata: z.record(z.unknown()).optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
})

const collectSchema = z.object({
  // Techo alineado con el de la RPC: el lote es lo que descarga el tracker de
  // una, no una sesion entera.
  events: z.array(eventSchema).min(1).max(50),
  context: z
    .object({
      path: z.string().trim().max(500).optional(),
      referrer: z.string().trim().max(500).optional(),
      utmSource: z.string().trim().max(80).optional(),
      utmMedium: z.string().trim().max(80).optional(),
      utmCampaign: z.string().trim().max(120).optional(),
      viewportWidth: z.coerce.number().int().min(0).max(20000).optional(),
      viewportHeight: z.coerce.number().int().min(0).max(20000).optional(),
      language: z.string().trim().max(20).optional(),
    })
    .optional()
    .default({}),
})

const rangeSchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  path: z.string().trim().max(300).optional(),
})

/** Ventana efectiva: `from`/`to` explicitos ganan sobre el atajo `days`. */
function resolveRange({ from, to, days }, now = new Date()) {
  const end = to ? new Date(to) : now
  const start = from ? new Date(from) : new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    throw new HttpError(400, 'Rango de fechas invalido.')
  }
  return { from: start.toISOString(), to: end.toISOString() }
}

export function createAnalyticsRoutes({ getPrisma, getSupabaseAdmin, repository, env = process.env }) {
  const router = Router()
  const prisma = getPrisma()
  const analyticsGuard = requirePermission('admin.analytics.read', { prisma })

  function repo() {
    if (repository) return repository
    const client = getSupabaseAdmin?.()
    if (!client) throw new HttpError(503, 'Supabase Admin no esta configurado.')
    return createSupabaseAnalyticsRepository(client)
  }

  /**
   * Ingesta publica. Responde 202 siempre que el lote sea valido: la analitica
   * no puede degradar la navegacion, asi que un fallo de escritura se registra
   * pero no se le devuelve al visitante como error de la pagina.
   */
  router.post('/collect', analyticsIngestLimiter, validateBody(collectSchema), async (req, res, next) => {
    try {
      const agent = describeUserAgent(req.get('user-agent'))
      // El trafico de bots se descarta antes de tocar la base: inflar el conteo
      // de visitantes con crawlers vuelve inservible el informe.
      if (agent.isBot) {
        res.status(202).json({ accepted: 0, ignored: 'bot' })
        return
      }

      const { events, context } = req.validatedBody
      const athleteSession = await readAthleteSession({
        client: getSupabaseAdmin?.(),
        token: req.cookies?.[ATHLETE_SESSION_COOKIE_NAME],
      }).catch(() => null)

      const appUrl = env.APP_URL ?? env.VITE_APP_URL
      const normalizedEvents = events.map((event) => ({
        ...event,
        path: normalizePath(event.path ?? context.path ?? '/'),
      }))

      const result = await repo().ingest({
        visitorId: resolveVisitorId(req, { env }),
        athleteId: athleteSession?.athleteId ?? null,
        events: normalizedEvents,
        context: {
          path: normalizePath(context.path ?? '/'),
          referrerHost: normalizeReferrerHost(context.referrer, appUrl),
          utmSource: context.utmSource ?? null,
          utmMedium: context.utmMedium ?? null,
          utmCampaign: context.utmCampaign ?? null,
          deviceType: agent.deviceType,
          browser: agent.browser,
          os: agent.os,
          viewportWidth: context.viewportWidth ?? null,
          viewportHeight: context.viewportHeight ?? null,
          language: context.language ?? null,
          // Vercel resuelve el pais en el edge; sin el header queda nulo y el
          // informe simplemente no segmenta por geografia.
          country: req.get('x-vercel-ip-country') ?? null,
        },
      })

      res.status(202).json({ accepted: result?.accepted ?? normalizedEvents.length })
    } catch (error) {
      next(error)
    }
  })

  router.get('/overview', ...analyticsGuard, staffLimiter, async (req, res, next) => {
    try {
      const query = parseRange(req)
      res.json(await repo().overview(resolveRange(query)))
    } catch (error) {
      next(error)
    }
  })

  router.get('/pages', ...analyticsGuard, staffLimiter, async (req, res, next) => {
    try {
      const query = parseRange(req)
      res.json({ pages: await repo().pages({ ...resolveRange(query), limit: query.limit }) })
    } catch (error) {
      next(error)
    }
  })

  router.get('/flows', ...analyticsGuard, staffLimiter, async (req, res, next) => {
    try {
      const query = parseRange(req)
      res.json({ flows: await repo().flows({ ...resolveRange(query), limit: query.limit }) })
    } catch (error) {
      next(error)
    }
  })

  router.get('/heatmap', ...analyticsGuard, staffLimiter, async (req, res, next) => {
    try {
      const query = parseRange(req)
      if (!query.path) throw new HttpError(400, 'Falta la ruta del mapa de calor.')
      res.json(await repo().heatmap({ ...resolveRange(query), path: normalizePath(query.path) }))
    } catch (error) {
      next(error)
    }
  })

  router.get('/funnel', ...analyticsGuard, staffLimiter, async (req, res, next) => {
    try {
      const query = parseRange(req)
      res.json({
        steps: await repo().funnel({ ...resolveRange(query), steps: [...MEMBERSHIP_FUNNEL_STEPS] }),
      })
    } catch (error) {
      next(error)
    }
  })

  function parseRange(req) {
    const parsed = rangeSchema.safeParse(req.query)
    if (!parsed.success) throw new HttpError(400, 'Parametros de analitica invalidos.')
    return parsed.data
  }

  return router
}
