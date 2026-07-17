import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../lib/errors.js'
import { validateBody } from '../lib/validate.js'
import { requireRole } from '../middleware/auth.js'
import { publicReadLimiter, staffLimiter, ticketPublicWriteLimiter } from '../middleware/rateLimit.js'
import { createSupabaseTicketRepository } from '../modules/ticketing/supabaseTicketRepository.js'

const CHECKIN_ROLES = ['admin_maximal', 'admin_plu_arg', 'operador_plu_arg', 'seguridad_plu_arg']
const FINANCE_ROLES = ['admin_maximal', 'admin_plu_arg', 'operador_plu_arg']

const attendeeSchema = z.object({
  fullName: z.string().trim().min(3), dni: z.string().trim().regex(/^\d{7,8}$/),
  dayPass: z.enum(['day1', 'day2', 'both']), addonIds: z.array(z.string().trim().min(1)).optional().default([]),
})
const createOrderSchema = z.object({
  eventSlug: z.string().trim().min(1), attendees: z.array(attendeeSchema).min(1).max(8),
  buyer: z.object({ name: z.string().trim().optional(), email: z.string().trim().email().optional(), phone: z.string().trim().optional() }).optional(),
  provider: z.enum(['mercado_pago', 'manual']).default('mercado_pago'),
  idempotencyKey: z.string().uuid().default(() => randomUUID()),
  accessToken: z.string().trim().min(32).optional(),
})
const accessSchema = z.object({ accessToken: z.string().trim().min(32) })

export function createTicketRoutes({ getPrisma, getSupabaseAdmin, repository }) {
  const router = Router()
  const repo = () => repository ?? createSupabaseTicketRepository(getSupabaseAdmin?.())
  const prisma = getPrisma()
  const guard = requireRole(CHECKIN_ROLES, { prisma })
  const financeGuard = requireRole(FINANCE_ROLES, { prisma })
  const actor = (req) => `${req.auth.user.id}:${req.auth.user.email}`

  // Solo una cuenta seguridad_plu_arg atada a un evento puntual (User.eventId,
  // creadas via POST /api/auth/security-users) queda restringida a ese evento.
  // Sin eventId asignado, un rol de check-in opera sobre cualquier evento
  // (mismo comportamiento que antes de este scoping).
  function assertEventScope(req, targetEventId) {
    const { role, eventId } = req.auth.user
    if (role !== 'seguridad_plu_arg' || !eventId) return
    if (targetEventId && targetEventId === eventId) return
    throw new HttpError(403, 'Esta cuenta no tiene acceso a este evento.')
  }

  function assertEventSlugScope(req, targetEventSlug) {
    const { role, eventSlug } = req.auth.user
    if (role !== 'seguridad_plu_arg' || !eventSlug) return
    if (targetEventSlug && targetEventSlug === eventSlug) return
    throw new HttpError(403, 'Esta cuenta no tiene acceso a este evento.')
  }

  router.post('/orders', ticketPublicWriteLimiter, validateBody(createOrderSchema), async (req, res, next) => {
    try { res.status(201).json(await repo().createOrder(req.validatedBody)) } catch (error) { next(error) }
  })
  router.post('/orders/:orderId/proof-upload', ticketPublicWriteLimiter, validateBody(accessSchema.extend({
    fileName: z.string().trim().min(1).max(120),
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
    size: z.number().int().positive().max(5 * 1024 * 1024),
  })), async (req, res, next) => {
    try { res.json(await repo().createProofUpload(req.params.orderId, req.validatedBody.accessToken, req.validatedBody.fileName)) }
    catch (error) { next(error) }
  })
  router.post('/orders/:orderId/proof', ticketPublicWriteLimiter, validateBody(accessSchema.extend({ proofPath: z.string().trim().min(3) })), async (req, res, next) => {
    try { res.json(await repo().registerProof(req.params.orderId, req.validatedBody.accessToken, req.validatedBody.proofPath)) }
    catch (error) { next(error) }
  })
  router.get('/verify/:qrToken', publicReadLimiter, async (req, res, next) => {
    try { res.json({ ticket: await repo().verify(req.params.qrToken) }) } catch (error) { next(error) }
  })
  router.get('/availability/:eventSlug', publicReadLimiter, async (req, res, next) => {
    try { res.json({ availability: await repo().availability(req.params.eventSlug) }) } catch (error) { next(error) }
  })

  router.get('/orders/pending-manual', ...financeGuard, staffLimiter, async (_req, res, next) => {
    try { res.json({ orders: await repo().listPending() }) } catch (error) { next(error) }
  })
  router.post('/orders/:orderId/approve', ...financeGuard, staffLimiter, async (req, res, next) => {
    try { res.json(await repo().approve(req.params.orderId)) } catch (error) { next(error) }
  })
  router.get('/orders/:orderId/proof-url', ...financeGuard, staffLimiter, async (req, res, next) => {
    try { res.json({ url: await repo().proofUrl(req.params.orderId) }) } catch (error) { next(error) }
  })

  router.get('/', ...guard, staffLimiter, async (req, res, next) => {
    try {
      const eventSlug = String(req.query.eventSlug ?? '')
      if (!eventSlug) throw new HttpError(400, 'Falta eventSlug.')
      assertEventSlugScope(req, eventSlug)
      res.json({ tickets: await repo().listForEvent(eventSlug) })
    } catch (error) { next(error) }
  })
  router.get('/allowlist/:eventSlug', ...guard, staffLimiter, async (req, res, next) => {
    try {
      assertEventSlugScope(req, req.params.eventSlug)
      res.json(await repo().allowlist(req.params.eventSlug))
    } catch (error) { next(error) }
  })
  router.post('/checkin/:qrToken', ...guard, staffLimiter, async (req, res, next) => {
    try {
      const ticket = await repo().verify(req.params.qrToken)
      assertEventScope(req, ticket?.event_id)
      res.json(await repo().checkIn(req.params.qrToken, req.body?.gate, actor(req)))
    } catch (error) { next(error) }
  })
  router.post('/checkin/:qrToken/addons/:addonId/redeem', ...guard, staffLimiter, async (req, res, next) => {
    try {
      const ticket = await repo().verify(req.params.qrToken)
      assertEventScope(req, ticket?.event_id)
      res.json(await repo().redeemAddon(req.params.qrToken, req.params.addonId, actor(req)))
    } catch (error) { next(error) }
  })
  router.post('/registrations/:registrationId/checkin', ...guard, staffLimiter, async (req, res, next) => {
    try {
      const registration = await prisma.eventRegistration.findUnique({
        where: { id: req.params.registrationId },
        select: { eventId: true },
      })
      assertEventScope(req, registration?.eventId)
      res.json(await repo().checkInRegistration(req.params.registrationId, req.body?.gate, actor(req)))
    } catch (error) { next(error) }
  })
  return router
}
