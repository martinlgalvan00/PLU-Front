import { timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { validateBody } from '../lib/validate.js'
import { requirePermission } from '../middleware/auth.js'
import { publicWriteLimiter, staffLimiter } from '../middleware/rateLimit.js'
import { createBrevoAdapter } from '../modules/notifications/brevoAdapter.js'
import { describeCatalog, MANUALLY_SENDABLE_EMAIL_TYPES } from '../modules/notifications/emailCatalog.js'
import { createEmailDispatcher } from '../modules/notifications/emailDispatcher.js'
import {
  createEventAudienceRepository,
  createEventNotificationService,
  EVENT_NOTIFICATION_AUDIENCES,
} from '../modules/notifications/eventNotificationService.js'
import { createSupabaseNotificationRepository } from '../modules/notifications/supabaseNotificationRepository.js'

/**
 * routes/emails.js — PLU ARG
 *
 * - `POST /send`            Disparo manual desde el panel admin.
 * - `POST /webhook/brevo`   Eventos de entrega y rebote que manda Brevo.
 * - `GET  /logs`            Auditoría de envíos.
 * - `GET  /catalog`         Qué templates están cargados y cuáles faltan.
 * - `POST /suppressions`    Alta y baja manual de la lista de supresión.
 */

const sendSchema = z.object({
  // Los tipos de cuenta (bienvenida, contraseña, acceso) quedan fuera a
  // propósito: los dispara el flujo, no un operador. Permitir un
  // `password_reset` a mano sería una vía de phishing con nuestro remitente.
  type: z.enum(MANUALLY_SENDABLE_EMAIL_TYPES),
  to: z.string().trim().email(),
  params: z.record(z.unknown()).optional(),
  subject: z.string().trim().min(1).max(200).optional(),
  entityType: z.string().trim().min(1).optional(),
  entityId: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(8).optional(),
})

const eventNotificationSchema = z.object({
  eventId: z.string().uuid(),
  audience: z.enum(EVENT_NOTIFICATION_AUDIENCES).default('registered'),
  type: z.enum(['event_announcement', 'event_reminder']).default('event_announcement'),
  // Distingue campañas sucesivas sobre el mismo evento. Sin esto, el segundo
  // aviso quedaría bloqueado por la idempotencia del primero.
  campaignKey: z.string().trim().min(3).max(60).optional(),
  subject: z.string().trim().min(1).max(200).optional(),
  summary: z.string().trim().max(600).optional(),
  notes: z.string().trim().max(600).optional(),
})

const suppressionSchema = z.object({
  email: z.string().trim().email(),
  reason: z.enum(['hard_bounce', 'soft_bounce', 'spam', 'blocked', 'invalid', 'unsubscribed']),
  detail: z.string().trim().max(500).optional(),
})

const logsQuerySchema = z.object({
  status: z
    .enum([
      'pending', 'processing', 'retrying', 'sent', 'delivered',
      'rejected', 'failed', 'bounced', 'skipped', 'suppressed',
    ])
    .optional(),
  type: z.string().trim().min(1).max(60).optional(),
  email: z.string().trim().email().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

/**
 * Eventos de Brevo que nos interesan. El resto (`request`, `click`, `opened`,
 * `deferred`) se acepta con 200 para que Brevo no reintente, pero se ignora.
 *
 * `error` es imprescindible y no obvio: Brevo puede aceptar el envío con 201 y
 * rechazarlo después, de forma asincrónica. Pasó en este proyecto con un
 * remitente sin validar ("Sending has been rejected because the sender you
 * used ... is not valid"). Sin escuchar `error`, el log queda en 'sent' y
 * parece que todo anda mientras no se entrega nada.
 */
const TRACKED_EVENTS = new Set([
  'delivered',
  'error',
  'hard_bounce',
  'soft_bounce',
  'blocked',
  'spam',
  'invalid_email',
  'unsubscribed',
])

/**
 * Brevo no es consistente entre su API de estadísticas (snake_case) y algunas
 * versiones del webhook (camelCase). Se normaliza a snake_case para no
 * depender de cuál manda cada cuenta.
 */
const EVENT_ALIASES = {
  hardBounce: 'hard_bounce',
  softBounce: 'soft_bounce',
  invalidEmail: 'invalid_email',
  invalid: 'invalid_email',
  unsubscribe: 'unsubscribed',
}

function normalizeBrevoEvent(raw) {
  const event = String(raw ?? '').trim()
  return EVENT_ALIASES[event] ?? event
}

/**
 * El webhook de Brevo no firma el payload. La protección es un token
 * compartido en la URL (`?token=...`), comparado en tiempo constante, más el
 * hecho de que la ruta solo escribe estado de entrega.
 */
function hasValidWebhookToken(req, secret) {
  const expected = Buffer.from(secret)
  const received = Buffer.from(String(req.query?.token ?? req.get('x-brevo-token') ?? ''))
  return expected.length === received.length && timingSafeEqual(expected, received)
}

export function createEmailRoutes(deps = {}) {
  const router = Router()
  const env = deps.env ?? process.env
  const prisma = deps.getPrisma?.()

  // No existe un permiso propio de emails y no corresponde inventar uno acá:
  // agregarlo tocaría `src/lib/permissions.js` y la matriz de roles. Se mapea
  // a los más cercanos: los logs son dato de auditoría, y mandar un mail a un
  // usuario es una escritura sobre usuarios.
  const readGuard = requirePermission('admin.audit.read', { prisma })
  const sendGuard = requirePermission('admin.users.write', { prisma })

  const buildRepository = () =>
    deps.repository ?? createSupabaseNotificationRepository(deps.supabaseAdmin ?? getSupabaseAdmin())

  const buildDispatcher = () =>
    createEmailDispatcher({
      repository: buildRepository(),
      brevo: deps.brevo ?? createBrevoAdapter({ env }),
      env,
    })

  router.post('/send', sendGuard, staffLimiter, validateBody(sendSchema), async (req, res, next) => {
    try {
      const { type, ...input } = req.validatedBody
      const result = await buildDispatcher().send(type, input)
      res.status(result.created ? 202 : 200).json({
        status: result.status,
        emailLog: result.emailLog,
      })
    } catch (error) {
      next(error)
    }
  })

  /**
   * Brevo manda los eventos en lote o de a uno. Siempre respondemos 200: un
   * 5xx acá provoca reintentos y, peor, que Brevo desactive el webhook. Los
   * errores de procesamiento se loguean y se siguen.
   */
  router.post('/webhook/brevo', publicWriteLimiter, async (req, res) => {
    const secret = String(env.BREVO_WEBHOOK_TOKEN ?? '').trim()
    if (!secret) {
      res.status(503).json({ error: 'Webhook de Brevo no configurado.' })
      return
    }
    if (!hasValidWebhookToken(req, secret)) {
      res.status(401).json({ error: 'No autorizado.' })
      return
    }

    const payload = req.body
    const events = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [payload]

    let processed = 0
    try {
      const repository = buildRepository()
      for (const item of events) {
        const event = normalizeBrevoEvent(item?.event)
        if (!TRACKED_EVENTS.has(event)) continue

        await repository.recordDeliveryEvent({
          // Brevo usa `message-id` en el webhook y `messageId` en la respuesta
          // del envío. Son el mismo identificador.
          messageId: item['message-id'] ?? item.messageId ?? null,
          event,
          email: item.email ?? null,
          reason: item.reason ?? null,
        })
        processed += 1
      }
    } catch (error) {
      console.error('brevo-webhook:', error?.message ?? error)
    }

    res.json({ received: events.length, processed })
  })

  /**
   * Aviso de evento a una audiencia. Guardado con `admin.events.write`: es una
   * comunicación masiva en nombre de la federación, no una escritura de
   * usuarios cualquiera.
   */
  router.post(
    '/events/notify',
    requirePermission('admin.events.write', { prisma }),
    staffLimiter,
    validateBody(eventNotificationSchema),
    async (req, res, next) => {
      try {
        const repository = buildRepository()
        const notifyEvent = createEventNotificationService({
          audienceRepository:
            deps.eventAudienceRepository ??
            createEventAudienceRepository(deps.supabaseAdmin ?? getSupabaseAdmin()),
          notificationRepository: repository,
          dispatcher: createEmailDispatcher({
            repository,
            brevo: deps.brevo ?? createBrevoAdapter({ env }),
            env,
          }),
          env,
        })
        res.status(202).json(await notifyEvent(req.validatedBody))
      } catch (error) {
        next(error)
      }
    },
  )

  router.get('/logs', readGuard, staffLimiter, async (req, res, next) => {
    try {
      const filters = logsQuerySchema.parse(req.query)
      const result = await buildRepository().listEmailLogs(filters)
      res.json(result)
    } catch (error) {
      next(error)
    }
  })

  /** Diagnóstico: qué tipos salen por template de Brevo y cuáles por fallback. */
  router.get('/catalog', readGuard, staffLimiter, (_req, res) => {
    const brevo = deps.brevo ?? createBrevoAdapter({ env })
    res.json({ configured: brevo.configured, types: describeCatalog(env) })
  })

  router.post('/suppressions', sendGuard, staffLimiter, validateBody(suppressionSchema), async (req, res, next) => {
    try {
      const suppression = await buildRepository().suppress({ ...req.validatedBody, source: 'manual' })
      res.status(201).json({ suppression })
    } catch (error) {
      next(error)
    }
  })

  router.delete('/suppressions/:email', sendGuard, staffLimiter, async (req, res, next) => {
    try {
      await buildRepository().removeSuppression(req.params.email)
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  return router
}

export default createEmailRoutes
