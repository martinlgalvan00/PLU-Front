import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { hasEventScopeAccess } from '../../src/lib/permissions.js'
import { HttpError } from '../lib/errors.js'
import {
  assertPaidCheckoutAvailable,
  resolvePaidCheckoutOverride,
} from '../lib/featureAvailability.js'
import { PUBLIC_CACHE_SECONDS, publicReadCache } from '../lib/http.js'
import { resolveEventRegistrationOpensAt } from '../lib/registrationSchedule.js'

// Solo hace falta resolver la fecha del evento cuando el gate va a mirarla:
// en produccion y sin kill switch. Evita una consulta a Supabase de mas en
// dev/tests y cuando PAID_CHECKOUT_ENABLED ya decide.
async function resolveScopedRegistrationOpensAt(env, supabase, eventSlug) {
  if (resolvePaidCheckoutOverride(env) !== null) return null
  return resolveEventRegistrationOpensAt(supabase, { eventSlug })
}
import { validateBody } from '../lib/validate.js'
import { requirePermission } from '../middleware/auth.js'
import {
  publicReadLimiter,
  staffLimiter,
  ticketPublicWriteLimiter,
} from '../middleware/rateLimit.js'
import { createSupabaseAthleteRepository } from '../modules/athletes/supabaseAthleteRepository.js'
import { createSupabaseTicketRepository } from '../modules/ticketing/supabaseTicketRepository.js'
import { createBrevoAdapter } from '../modules/notifications/brevoAdapter.js'
import { createEmailDispatcher } from '../modules/notifications/emailDispatcher.js'
import { createSupabaseNotificationRepository } from '../modules/notifications/supabaseNotificationRepository.js'
import { displayPaymentConcept } from '../modules/notifications/paymentNotificationService.js'
import { buildEventPagePath } from '../../src/lib/eventPageRoute.js'
import { resolveDeploymentAppUrl } from '../lib/deploymentEnvironment.js'
import { logger } from '../lib/logger.js'
import { createSupabasePlatformSettingsRepository } from '../modules/settings/supabasePlatformSettingsRepository.js'
import {
  assertCheckoutEnabled,
  assertPaymentChannelEnabled,
  assertTicketCheckoutEnabled,
  assertValidationEnabled,
  resolvePublicCheckoutAvailability,
} from '../services/platformFeatureToggleService.js'

const attendeeSchema = z.object({
  fullName: z.string().trim().min(3),
  dni: z
    .string()
    .trim()
    .regex(/^\d{7,8}$/),
  ticketTypeId: z.string().uuid(),
  addonIds: z.array(z.string().trim().min(1)).optional().default([]),
})
const createOrderSchema = z.object({
  eventSlug: z.string().trim().min(1),
  attendees: z.array(attendeeSchema).min(1).max(8),
  buyer: z
    .object({
      name: z.string().trim().optional(),
      email: z.string().trim().email().optional(),
      phone: z.string().trim().optional(),
    })
    .optional(),
  provider: z.enum(['mercado_pago', 'manual']).default('mercado_pago'),
  idempotencyKey: z
    .string()
    .uuid()
    .default(() => randomUUID()),
  accessToken: z.string().trim().min(32).optional(),
})
const accessSchema = z.object({ accessToken: z.string().trim().min(32) })
const rejectOrderSchema = z.object({ reason: z.string().trim().min(3).max(500) })

export function createTicketRoutes({
  getPrisma,
  getSupabaseAdmin,
  repository,
  athleteRepository,
  platformSettingsRepository,
  env = process.env,
  brevo,
}) {
  const router = Router()
  const repo = () => repository ?? createSupabaseTicketRepository(getSupabaseAdmin?.())
  const athleteRepo = () =>
    athleteRepository ?? createSupabaseAthleteRepository(getSupabaseAdmin?.())
  const platformSettingsRepo = () => {
    // Mismo criterio que athletes.js/payments.js: los dobles de test no
    // conocen la tabla de interruptores, así que en test quedan abiertos por
    // defecto. En runtime real no hay bypass.
    if (!platformSettingsRepository && (env.NODE_ENV ?? process.env.NODE_ENV) === 'test') {
      // Vacío = abierto: los asserts sólo cortan con `false` explícito.
      return { get: async () => ({}) }
    }
    return (
      platformSettingsRepository ?? createSupabasePlatformSettingsRepository(getSupabaseAdmin?.())
    )
  }
  const prisma = getPrisma()
  const guard = requirePermission('admin.checkin.execute', { prisma })
  const financeReadGuard = requirePermission('admin.payments.read', { prisma })
  const financeWriteGuard = requirePermission('admin.payments.approve', { prisma })
  const actor = (req) => `${req.auth.user.id}:${req.auth.user.email}`
  const mailer = brevo ?? createBrevoAdapter({ env })
  const appUrl = (resolveDeploymentAppUrl(env) || env.VITE_APP_URL || '').replace(/\/$/, '')

  // Espejo del dispatcher de athletes.js: sin Supabase queda en modo
  // degradado (envía sin log) en vez de romper el armado de la app.
  function mailDispatcher() {
    let notificationRepository = null
    try {
      const supabase = getSupabaseAdmin?.()
      if (supabase) notificationRepository = createSupabaseNotificationRepository(supabase)
    } catch {
      notificationRepository = null
    }
    return createEmailDispatcher({ repository: notificationRepository, brevo: mailer, env })
  }

  async function sendBestEffort(type, input) {
    try {
      return await mailDispatcher().send(type, input)
    } catch (error) {
      logger.warn(`email.${type}_failed`, { err: error })
      return { status: 'failed', created: false, emailLog: error?.emailLog ?? null }
    }
  }
  function parseOrderId(req) {
    const parsed = z.string().uuid().safeParse(req.params.orderId)
    if (!parsed.success) throw new HttpError(400, 'Orden invalida.')
    return parsed.data
  }
  const verifiedTicketEventId = (result) => result?.ticket?.event_id ?? result?.event_id

  // El alcance vive en la cuenta, no en el nombre del rol. Cualquier usuario
  // con eventId/eventSlug asignado queda limitado a ese evento; los roles
  // globales con admin.checkin.execute pueden operar cualquier evento.
  function assertEventScope(req, targetEventId) {
    if (hasEventScopeAccess(req.auth.user, { eventId: targetEventId })) return
    throw new HttpError(403, 'Esta cuenta no tiene acceso a este evento.')
  }

  function assertEventSlugScope(req, targetEventSlug) {
    if (hasEventScopeAccess(req.auth.user, { eventSlug: targetEventSlug })) return
    throw new HttpError(403, 'Esta cuenta no tiene acceso a este evento.')
  }

  router.post(
    '/orders',
    ticketPublicWriteLimiter,
    validateBody(createOrderSchema),
    async (req, res, next) => {
      try {
        const registrationOpensAt = await resolveScopedRegistrationOpensAt(
          env,
          getSupabaseAdmin?.(),
          req.validatedBody.eventSlug,
        )
        await assertPaidCheckoutAvailable(env, new Date(), {
          registrationOpensAt,
          skipScheduleLookup: true,
          checkoutKind: 'ticket',
        })
        const toggles = await platformSettingsRepo().get()
        assertCheckoutEnabled(toggles)
        assertTicketCheckoutEnabled(toggles, env)
        // Las entradas no tienen efectivo en Pitbull: `manual` es transferencia.
        assertPaymentChannelEnabled(
          toggles,
          'ticket',
          req.validatedBody.provider === 'manual' ? 'bank_transfer' : 'mercado_pago',
        )
        res.status(201).json(await repo().createOrder(req.validatedBody))
      } catch (error) {
        next(error)
      }
    },
  )
  router.post(
    '/orders/:orderId/proof-upload',
    ticketPublicWriteLimiter,
    validateBody(
      accessSchema.extend({
        fileName: z.string().trim().min(1).max(120),
        contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
        size: z
          .number()
          .int()
          .positive()
          .max(5 * 1024 * 1024),
      }),
    ),
    async (req, res, next) => {
      try {
        res.json(
          await repo().createProofUpload(
            parseOrderId(req),
            req.validatedBody.accessToken,
            req.validatedBody.fileName,
          ),
        )
      } catch (error) {
        next(error)
      }
    },
  )
  router.post(
    '/orders/:orderId/proof',
    ticketPublicWriteLimiter,
    validateBody(accessSchema.extend({ proofPath: z.string().trim().min(3) })),
    async (req, res, next) => {
      try {
        res.json(
          await repo().registerProof(
            parseOrderId(req),
            req.validatedBody.accessToken,
            req.validatedBody.proofPath,
          ),
        )
      } catch (error) {
        next(error)
      }
    },
  )
  router.get('/verify/:qrToken', publicReadLimiter, async (req, res, next) => {
    try {
      res.json({ ticket: await repo().verify(req.params.qrToken) })
    } catch (error) {
      next(error)
    }
  })
  /**
   * `checkout` viaja junto a la disponibilidad porque la pantalla de entradas
   * necesita las dos cosas para armarse: cuántos lugares quedan y qué medios de
   * pago están abiertos. Sin esto, la página ofrecía transferencia y el 409
   * recién aparecía al enviar la compra.
   */
  router.get('/availability/:eventSlug', publicReadLimiter, async (req, res, next) => {
    try {
      const [availability, toggles] = await Promise.all([
        repo().availability(req.params.eventSlug),
        platformSettingsRepo().get(),
      ])
      const { ticketEnabled, ticketManualEnabled, paymentChannels } =
        resolvePublicCheckoutAvailability(toggles, env)
      // Ventana corta: el stock que se muestra acá decide una compra. La
      // reserva real se valida igual al crear la orden, así que 10 s de atraso
      // no habilitan una venta de más -- como mucho un 409 al confirmar.
      res.set('Cache-Control', publicReadCache(PUBLIC_CACHE_SECONDS.LIVE))
      res.json({
        availability,
        checkout: { ticketEnabled, ticketManualEnabled, channels: paymentChannels.ticket },
      })
    } catch (error) {
      next(error)
    }
  })

  router.get(
    '/orders/pending-manual',
    ...financeReadGuard,
    staffLimiter,
    async (_req, res, next) => {
      try {
        res.json({ orders: await repo().listPending() })
      } catch (error) {
        next(error)
      }
    },
  )
  router.post(
    '/orders/:orderId/approve',
    ...financeWriteGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        assertValidationEnabled(await platformSettingsRepo().get(), 'ticket')
        res.json(await repo().approve(parseOrderId(req), actor(req)))
      } catch (error) {
        next(error)
      }
    },
  )
  /**
   * Rechazo de comprobante: cancela los tickets `pendiente_pago` de la orden
   * para liberar el cupo (mismo efecto que `expire_ticket_reservations`, acá
   * por decisión del staff) y avisa al comprador por email —es un comprador
   * anónimo sin cuenta, no tiene otra forma de enterarse salvo que siga en la
   * misma sesión de browser que creó la orden.
   */
  router.post(
    '/orders/:orderId/reject',
    ...financeWriteGuard,
    staffLimiter,
    validateBody(rejectOrderSchema),
    async (req, res, next) => {
      try {
        const orderId = parseOrderId(req)
        assertValidationEnabled(await platformSettingsRepo().get(), 'ticket')
        const result = await repo().reject(orderId, req.validatedBody.reason, actor(req))
        const order = result?.order
        if (order?.buyer_email) {
          const event = await athleteRepo()
            .findEventSummary(order.event_id)
            .catch(() => null)
          await sendBestEffort('payment_rejected', {
            to: order.buyer_email,
            toName: order.buyer_name,
            entityType: 'ticket_order',
            entityId: order.id,
            idempotencyKey: `email:payment-rejected:manual:${order.id}:${order.updated_at}`,
            params: {
              name: order.buyer_name,
              amount: order.amount,
              concept: displayPaymentConcept('tickets'),
              reason: req.validatedBody.reason,
              retryUrl: event?.slug ? `${appUrl}${buildEventPagePath(event.slug)}` : appUrl,
            },
          }).catch((error) =>
            logger.warn('payment.manual_rejection_email_failed', { orderId, err: error }),
          )
        }
        res.json(result)
      } catch (error) {
        next(error)
      }
    },
  )
  router.get(
    '/orders/:orderId/proof-url',
    ...financeReadGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        res.json({ url: await repo().proofUrl(parseOrderId(req)) })
      } catch (error) {
        next(error)
      }
    },
  )

  router.get('/', ...guard, staffLimiter, async (req, res, next) => {
    try {
      const eventSlug = String(req.query.eventSlug ?? '')
      if (!eventSlug) throw new HttpError(400, 'Falta eventSlug.')
      assertEventSlugScope(req, eventSlug)
      res.json({ tickets: await repo().listForEvent(eventSlug) })
    } catch (error) {
      next(error)
    }
  })
  /**
   * Credencial de socio para el scanner de staff. La proyección pública dejó
   * de exponer el documento (el member_code es enumerable, así que devolver
   * PII ahí era una fuga), pero en la puerta el operador tiene que cotejar el
   * DNI físico contra el registro. Detrás de admin.checkin.execute y del mismo
   * alcance de evento que el resto del portal.
   */
  router.get('/credentials/:code', ...guard, staffLimiter, async (req, res, next) => {
    try {
      const eventSlug = req.query.eventSlug ? String(req.query.eventSlug) : null
      // La RPC no filtra por evento (solo usa eventSlug para adjuntar la
      // inscripción); el scope tiene que exigirse siempre, no solo cuando el
      // caller decide mandar eventSlug, o una cuenta de puerta acotada a un
      // evento podría omitirlo y leer la credencial de cualquier socio.
      assertEventSlugScope(req, eventSlug)
      res.json(await athleteRepo().staffCredential(String(req.params.code), eventSlug))
    } catch (error) {
      next(error)
    }
  })
  router.get('/allowlist/:eventSlug', ...guard, staffLimiter, async (req, res, next) => {
    try {
      assertEventSlugScope(req, req.params.eventSlug)
      res.json(await repo().allowlist(req.params.eventSlug))
    } catch (error) {
      next(error)
    }
  })
  router.post('/checkin/:qrToken', ...guard, staffLimiter, async (req, res, next) => {
    try {
      const ticket = await repo().verify(req.params.qrToken)
      assertEventScope(req, verifiedTicketEventId(ticket))
      res.json(await repo().checkIn(req.params.qrToken, req.body?.gate, actor(req)))
    } catch (error) {
      next(error)
    }
  })
  router.post(
    '/checkin/:qrToken/addons/:addonId/redeem',
    ...guard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const ticket = await repo().verify(req.params.qrToken)
        assertEventScope(req, verifiedTicketEventId(ticket))
        res.json(await repo().redeemAddon(req.params.qrToken, req.params.addonId, actor(req)))
      } catch (error) {
        next(error)
      }
    },
  )
  router.post(
    '/registrations/:registrationId/checkin',
    ...guard,
    staffLimiter,
    async (req, res, next) => {
      try {
        // Las inscripciones operativas viven en Supabase. Consultar Prisma aca
        // mezclaba dos fuentes de verdad y bloqueaba a los guardias acotados a
        // un evento porque la tabla Prisma de eventos es solamente legacy.
        const ticketRepository = repo()
        const eventId = await ticketRepository.getRegistrationEventId(req.params.registrationId)
        assertEventScope(req, eventId)
        res.json(
          await ticketRepository.checkInRegistration(
            req.params.registrationId,
            req.body?.gate,
            actor(req),
          ),
        )
      } catch (error) {
        next(error)
      }
    },
  )
  return router
}
