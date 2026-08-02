import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { hasEventScopeAccess } from '../../src/lib/permissions.js'
import { HttpError } from '../lib/errors.js'
import { validateBody } from '../lib/validate.js'
import { requirePermission } from '../middleware/auth.js'
import {
  publicReadLimiter,
  staffLimiter,
  ticketPublicWriteLimiter,
} from '../middleware/rateLimit.js'
import { createSupabaseAthleteRepository } from '../modules/athletes/supabaseAthleteRepository.js'
import { createSupabaseTicketRepository } from '../modules/ticketing/supabaseTicketRepository.js'

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

export function createTicketRoutes({ getPrisma, getSupabaseAdmin, repository, athleteRepository }) {
  const router = Router()
  const repo = () => repository ?? createSupabaseTicketRepository(getSupabaseAdmin?.())
  const athleteRepo = () => athleteRepository ?? createSupabaseAthleteRepository(getSupabaseAdmin?.())
  const prisma = getPrisma()
  const guard = requirePermission('admin.checkin.execute', { prisma })
  const financeReadGuard = requirePermission('admin.payments.read', { prisma })
  const financeWriteGuard = requirePermission('admin.payments.approve', { prisma })
  const actor = (req) => `${req.auth.user.id}:${req.auth.user.email}`
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
            req.params.orderId,
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
            req.params.orderId,
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
  router.get('/availability/:eventSlug', publicReadLimiter, async (req, res, next) => {
    try {
      res.json({ availability: await repo().availability(req.params.eventSlug) })
    } catch (error) {
      next(error)
    }
  })

  router.get('/orders/pending-manual', ...financeReadGuard, staffLimiter, async (_req, res, next) => {
    try {
      res.json({ orders: await repo().listPending() })
    } catch (error) {
      next(error)
    }
  })
  router.post('/orders/:orderId/approve', ...financeWriteGuard, staffLimiter, async (req, res, next) => {
    try {
      res.json(await repo().approve(req.params.orderId))
    } catch (error) {
      next(error)
    }
  })
  router.get(
    '/orders/:orderId/proof-url',
    ...financeReadGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        res.json({ url: await repo().proofUrl(req.params.orderId) })
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
      if (eventSlug) assertEventSlugScope(req, eventSlug)
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
          await ticketRepository.checkInRegistration(req.params.registrationId, req.body?.gate, actor(req)),
        )
      } catch (error) {
        next(error)
      }
    },
  )
  return router
}
