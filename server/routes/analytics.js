import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../lib/errors.js'
import { validateBody } from '../lib/validate.js'
import { requirePermission } from '../middleware/auth.js'
import { analyticsIngestLimiter, liveLimiter, staffLimiter } from '../middleware/rateLimit.js'
import { createSupabaseAnalyticsRepository } from '../modules/analytics/supabaseAnalyticsRepository.js'
import {
  recordOperationalAuditEvent,
  requestAuditMetadata,
} from '../modules/audit/operationalAuditWriter.js'
import { normalizePath, normalizeReferrerHost } from '../modules/analytics/normalizePath.js'
import { describeUserAgent, resolveVisitorId } from '../modules/analytics/visitorIdentity.js'
import {
  ATHLETE_SESSION_COOKIE_NAME,
  readAthleteSession,
} from '../services/athleteSessionService.js'

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
//
// Los dos ultimos estan calificados por flujo. Con `payment_submitted` a secas
// —que emiten por igual afiliacion, inscripcion y entradas— un pago de
// inscripcion entraba al embudo de afiliacion sin haber pasado por
// `membership_checkout_opened`, la cadena se cortaba ahi y el paso se
// reportaba en cero. El panel mostraba 0 pagos habiendo dos registrados.
export const MEMBERSHIP_FUNNEL_STEPS = Object.freeze([
  'landing_view',
  'membership_view',
  'membership_checkout_opened',
  'membership_payment_submitted',
  'membership_payment_approved',
])

const eventSchema = z.object({
  type: z.enum([
    'pageview',
    'click',
    'scroll',
    'form_start',
    'form_submit',
    'form_error',
    'conversion',
    'search',
    'outbound',
    'error',
    'custom',
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
  // Techo mas alto que el del viewport: un documento largo lo supera holgado.
  documentWidth: z.coerce.number().int().min(0).max(200000).optional(),
  documentHeight: z.coerce.number().int().min(0).max(200000).optional(),
  scrollDepth: z.coerce.number().min(0).max(1).optional(),
  name: z.string().trim().max(80).optional(),
  value: z.coerce.number().optional(),
  metadata: z.record(z.unknown()).optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
})

const collectSchema = z
  .object({
    // Techo alineado con el de la RPC: el lote es lo que descarga el tracker de
    // una, no una sesion entera. El piso es cero porque un lote puede traer
    // solo tiempo activo: ver `activeMs`.
    events: z.array(eventSchema).max(50),
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
        /**
         * Tiempo con la pestaña visible desde el lote anterior. Es propiedad de
         * la sesion y no de un evento, por eso viaja en el contexto: alguien
         * que lee sin tocar nada produce tiempo activo y cero eventos.
         *
         * El techo son 15 minutos, holgado frente al latido de 30s del tracker.
         * Sirve contra un reloj que salta y contra un cliente que quiera
         * inflar el tiempo de permanencia a mano.
         */
        activeMs: z.coerce.number().int().min(0).max(900_000).optional(),
      })
      .optional()
      .default({}),
  })
  // Un lote sin eventos y sin tiempo activo no aporta nada y no deberia abrir
  // una sesion.
  .refine((body) => body.events.length > 0 || (body.context?.activeMs ?? 0) > 0, {
    message: 'El lote no tiene eventos ni tiempo activo.',
    path: ['events'],
  })

/**
 * Ventana de "ahora". El techo de 60 minutos no es cosmetico: la RPC de
 * presencia recorre sesiones sin acotar por `started_at`, y una ventana mayor
 * la convertiria en el informe historico —que ya existe, con sus propios
 * indices— servido por un endpoint pensado para consultarse cada 15 segundos.
 */
const liveQuerySchema = z.object({
  windowMinutes: z.coerce.number().int().min(1).max(60).optional().default(5),
})

const rangeSchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  path: z.string().trim().max(300).optional(),
  // Un mapa de calor que mezcla mobile y desktop promedia dos documentos de
  // alto distinto: el mismo 0.5 vertical cae en secciones diferentes.
  deviceType: z.enum(['desktop', 'mobile', 'tablet', 'unknown']).optional(),
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * El timeline se acota aparte del `limit` de las tablas agregadas: 25 filas
 * alcanzan para un top de paginas, pero reconstruir un recorrido con 25 eventos
 * no sirve para nada. El techo duro tambien vive en la RPC.
 */
function journeyLimit(query) {
  return Math.min(500, Math.max(50, (query.limit ?? 25) * 8))
}

export function createAnalyticsRoutes({
  getPrisma,
  getSupabaseAdmin,
  repository,
  env = process.env,
}) {
  const router = Router()
  const prisma = getPrisma()
  const analyticsGuard = requirePermission('admin.analytics.read', { prisma })
  const identityGuard = requirePermission('admin.analytics.identity', { prisma })

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
  router.post(
    '/collect',
    analyticsIngestLimiter,
    validateBody(collectSchema),
    async (req, res, next) => {
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
            activeMs: context.activeMs ?? 0,
            // Vercel resuelve el pais en el edge; sin el header queda nulo y el
            // informe simplemente no segmenta por geografia.
            country: req.get('x-vercel-ip-country') ?? null,
          },
        })

        res.status(202).json({ accepted: result?.accepted ?? normalizedEvents.length })
      } catch (error) {
        next(error)
      }
    },
  )

  router.get('/overview', ...analyticsGuard, staffLimiter, async (req, res, next) => {
    try {
      const query = parseRange(req)
      res.json(await repo().overview(resolveRange(query)))
    } catch (error) {
      next(error)
    }
  })
  router.get('/operational-summary', ...analyticsGuard, staffLimiter, async (req, res, next) => {
    try {
      const query = parseRange(req)
      res.json(await repo().operationalSummary(resolveRange(query)))
    } catch (error) {
      next(error)
    }
  })
  router.get('/operational-alerts', ...analyticsGuard, staffLimiter, async (_req, res, next) => {
    try {
      res.json({ alerts: await repo().operationalAlerts() })
    } catch (error) {
      next(error)
    }
  })

  /**
   * Consumo del plan de Supabase.
   *
   * Vive en analitica y no en `/api/health` a proposito: health responde si el
   * sistema esta vivo y lo consulta la infraestructura sin sesion, mientras que
   * esto es un informe de capacidad -- expone el detalle de tablas y filas, que
   * es informacion de la instalacion y va detras del mismo permiso que el resto
   * del panel.
   *
   * `no-store`: un numero de ocupacion cacheado es peor que no tenerlo, porque
   * se sigue mirando cuando ya cambio.
   */
  router.get('/database-usage', ...analyticsGuard, staffLimiter, async (req, res, next) => {
    try {
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 15))
      res.set('Cache-Control', 'no-store')
      res.json(await repo().databaseUsage({ limit }))
    } catch (error) {
      next(error)
    }
  })

  /**
   * Presencia en vivo: cuanta gente hay en el sitio ahora y donde esta parada.
   *
   * Es el unico endpoint del informe pensado para consultarse en bucle mientras
   * dura un evento, y eso obliga a dos cosas que el resto no necesita:
   *
   *   - `no-store`. Un panel que refresca cada 15 segundos contra una respuesta
   *     cacheada muestra un numero viejo con cara de numero nuevo, que es peor
   *     que no mostrarlo.
   *   - `liveLimiter` propio. Con `staffLimiter` (pensado para lecturas
   *     esporadicas del panel) una sola pestaña abierta con auto-refresco
   *     consumiria la cuota de todo el equipo.
   */
  router.get('/live', ...analyticsGuard, liveLimiter, async (req, res, next) => {
    try {
      const parsed = liveQuerySchema.safeParse(req.query)
      if (!parsed.success) throw new HttpError(400, 'Ventana de tiempo real invalida.')
      res.set('Cache-Control', 'no-store')
      res.json(await repo().live(parsed.data))
    } catch (error) {
      next(error)
    }
  })

  /**
   * Cuantas personas entraron correctamente y cuantas quedaron afuera.
   *
   * Vive en analitica y no en auditoria porque es una lectura agregada de
   * producto, pero los datos salen de la bitacora de identidad: son accesos
   * auditados, no visitas inferidas del tracker.
   */
  router.get('/access', ...analyticsGuard, staffLimiter, async (req, res, next) => {
    try {
      const query = parseRange(req)
      res.json(await repo().accessMetrics(resolveRange(query)))
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
      res.json(
        await repo().heatmap({
          ...resolveRange(query),
          path: normalizePath(query.path),
          deviceType: query.deviceType ?? null,
        }),
      )
    } catch (error) {
      next(error)
    }
  })

  /** Lo mas usado del sitio entero, por elemento y no por ruta. */
  router.get('/elements', ...analyticsGuard, staffLimiter, async (req, res, next) => {
    try {
      const query = parseRange(req)
      res.json({ elements: await repo().elements({ ...resolveRange(query), limit: query.limit }) })
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

  /**
   * Recorrido de un atleta puntual: la unica lectura del informe que no viene
   * agregada. Tres cosas la separan del resto:
   *
   * - Permiso propio (`admin.analytics.identity`). Ver metricas de producto y
   *   abrir la navegacion de una persona con nombre no son el mismo acceso.
   * - Queda registrada en la auditoria operativa: quien consulto, a quien y con
   *   que ventana. Un acceso a datos personales que no deja rastro no es
   *   defendible ante la propia persona.
   * - El registro se escribe antes de responder, pero no bloquea: si la
   *   bitacora falla, `recordOperationalAuditEvent` lo avisa por consola y no
   *   convierte una falla de observabilidad en un 500 del panel.
   */
  router.get(
    '/athletes/:athleteId/journey',
    ...identityGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const athleteId = String(req.params.athleteId ?? '').trim()
        if (!UUID_PATTERN.test(athleteId)) {
          throw new HttpError(400, 'Identificador de atleta invalido.')
        }

        const query = parseRange(req)
        const range = resolveRange(query)

        void recordOperationalAuditEvent(getSupabaseAdmin?.(), {
          source: 'identity',
          action: 'analytics.athlete_journey_viewed',
          entityType: 'athlete',
          entityId: athleteId,
          actorType: 'staff',
          actorId: req.auth?.user?.id ?? null,
          severity: 'info',
          metadata: requestAuditMetadata(req, {
            from: range.from,
            to: range.to,
            actorEmail: req.auth?.user?.email ?? null,
          }),
        })

        res.json(await repo().athleteJourney({ athleteId, ...range, limit: journeyLimit(query) }))
      } catch (error) {
        next(error)
      }
    },
  )

  function parseRange(req) {
    const parsed = rangeSchema.safeParse(req.query)
    if (!parsed.success) throw new HttpError(400, 'Parametros de analitica invalidos.')
    return parsed.data
  }

  return router
}
