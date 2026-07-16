import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../lib/errors.js'
import { validateBody } from '../lib/validate.js'
import { requireRole } from '../middleware/auth.js'
import { athleteWriteLimiter, publicWriteLimiter, staffLimiter } from '../middleware/rateLimit.js'
import { hashPassword, verifyPassword } from '../services/passwordService.js'
import {
  assertAthleteOwnsPath,
  createSupabaseAthleteRepository,
} from '../modules/athletes/supabaseAthleteRepository.js'
import {
  ATHLETE_SESSION_COOKIE_NAME,
  createAthleteSession,
  getAthleteSessionCookieOptions,
  getClearAthleteSessionCookieOptions,
  requireAthleteSession,
  revokeAthleteSession,
} from '../services/athleteSessionService.js'

const ADMIN_ROLES = ['admin_maximal', 'admin_plu_arg', 'operador_plu_arg', 'viewer_plu_usa', 'seguridad_plu_arg']
const FINANCE_ROLES = ['admin_maximal', 'admin_plu_arg', 'operador_plu_arg']
const ACCOUNT_ROLES = ['admin_maximal', 'admin_plu_arg']

const registerSchema = z.object({
  fullName: z.string().trim().min(3),
  documentId: z.string().trim().regex(/^\d{7,8}$/),
  email: z.string().trim().email(),
  birthDate: z.string().trim().min(8),
  phone: z.string().trim().min(6),
  country: z.string().trim().min(2),
  province: z.string().trim().min(2),
  city: z.string().trim().min(2),
  gym: z.string().trim().optional().default(''),
  sex: z.string().trim().min(1),
  division: z.string().trim().min(1),
  category: z.string().trim().min(1),
  estimatedWeight: z.union([z.string(), z.number()]).optional().nullable(),
  password: z.string().min(12).max(72),
})
const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(72) })
const updateSchema = z.object({
  email: z.string().trim().email(), phone: z.string().trim().min(6), city: z.string().trim().min(2),
  province: z.string().trim().min(2), gym: z.string().trim().optional().default(''),
})
const orderSchema = z.object({
  paymentMethod: z.enum(['mercado_pago', 'manual_link']),
  planCode: z.string().trim().min(2).default('plu-annual'),
  idempotencyKey: z.string().uuid().default(() => randomUUID()),
})
const registrationSchema = z.object({
  eventSlug: z.string().trim().min(1), division: z.string().trim().min(1), category: z.string().trim().min(1),
  bodyweightKg: z.number().positive().nullable().optional(), paymentMethod: z.enum(['mercado_pago', 'manual_link']),
  idempotencyKey: z.string().uuid().default(() => randomUUID()),
})
const uploadSchema = z.object({
  fileName: z.string().trim().min(1).max(120),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  size: z.number().int().positive().max(3 * 1024 * 1024),
})

export function createAthleteRoutes({ getPrisma, getSupabaseAdmin, repository, env = process.env }) {
  const router = Router()
  const client = () => getSupabaseAdmin?.()
  const repo = () => repository ?? createSupabaseAthleteRepository(client())
  const athlete = async (req) => requireAthleteSession({ client: client(), req })
  const prisma = getPrisma()
  const adminGuard = requireRole(ADMIN_ROLES, { prisma })
  const financeGuard = requireRole(FINANCE_ROLES, { prisma })
  const accountGuard = requireRole(ACCOUNT_ROLES, { prisma })

  router.post('/register', publicWriteLimiter, validateBody(registerSchema), async (req, res, next) => {
    try {
      const { password, ...form } = req.validatedBody
      const row = await repo().register(form, await hashPassword(password))
      const session = await createAthleteSession({ client: client(), athleteId: row.id, req })
      res.cookie(ATHLETE_SESSION_COOKIE_NAME, session.token, getAthleteSessionCookieOptions(env))
      res.status(201).json({ athlete: row })
    } catch (error) { next(error) }
  })

  router.post('/login', publicWriteLimiter, validateBody(loginSchema), async (req, res, next) => {
    try {
      const row = await repo().findLogin(req.validatedBody.email)
      if (!row || row.status === 'bloqueado' || !(await verifyPassword(req.validatedBody.password, row.password_hash))) {
        throw new HttpError(401, 'Credenciales invalidas.')
      }
      const session = await createAthleteSession({ client: client(), athleteId: row.id, req })
      res.cookie(ATHLETE_SESSION_COOKIE_NAME, session.token, getAthleteSessionCookieOptions(env))
      res.json({ user: { role: 'athlete_plu', athleteId: row.id, name: row.full_name, email: row.email } })
    } catch (error) { next(error) }
  })

  router.get('/session', async (req, res, next) => {
    try {
      const auth = await athlete(req)
      const data = await repo().snapshot(auth.athleteId)
      res.json({
        user: { role: 'athlete_plu', athleteId: auth.athleteId, name: data.athlete.full_name, email: data.athlete.email },
        ...data,
      })
    } catch (error) { next(error) }
  })

  router.post('/logout', async (req, res, next) => {
    try {
      await revokeAthleteSession({ client: client(), token: req.cookies?.[ATHLETE_SESSION_COOKIE_NAME] })
      res.clearCookie(ATHLETE_SESSION_COOKIE_NAME, getClearAthleteSessionCookieOptions(env))
      res.status(204).end()
    } catch (error) { next(error) }
  })

  router.patch('/me', athleteWriteLimiter, validateBody(updateSchema), async (req, res, next) => {
    try { const auth = await athlete(req); res.json({ athlete: await repo().update(auth.athleteId, req.validatedBody) }) }
    catch (error) { next(error) }
  })
  router.post('/me/membership-orders', publicWriteLimiter, validateBody(orderSchema), async (req, res, next) => {
    try { const auth = await athlete(req); res.status(201).json(await repo().createMembershipOrder(auth.athleteId, req.validatedBody)) }
    catch (error) { next(error) }
  })
  router.post('/me/registrations', publicWriteLimiter, validateBody(registrationSchema), async (req, res, next) => {
    try { const auth = await athlete(req); res.status(201).json(await repo().createRegistration(auth.athleteId, req.validatedBody)) }
    catch (error) { next(error) }
  })
  router.post('/me/photo-upload', athleteWriteLimiter, validateBody(uploadSchema), async (req, res, next) => {
    try { const auth = await athlete(req); res.json(await repo().createPhotoUpload(auth.athleteId, req.validatedBody)) }
    catch (error) { next(error) }
  })
  router.post('/me/photo', athleteWriteLimiter, validateBody(z.object({ photoPath: z.string().trim().nullable() })), async (req, res, next) => {
    try {
      const auth = await athlete(req)
      if (req.validatedBody.photoPath) assertAthleteOwnsPath(auth.athleteId, req.validatedBody.photoPath)
      res.json({ athlete: await repo().registerPhoto(auth.athleteId, req.validatedBody.photoPath) })
    } catch (error) { next(error) }
  })
  router.post('/me/password', athleteWriteLimiter, validateBody(z.object({
    currentPassword: z.string().min(1).max(72),
    newPassword: z.string().min(12).max(72),
  })), async (req, res, next) => {
    try {
      const auth = await athlete(req)
      const credential = await repo().credential(auth.athleteId)
      if (!credential || !(await verifyPassword(req.validatedBody.currentPassword, credential.password_hash))) {
        throw new HttpError(401, 'La contraseña actual no es correcta.')
      }
      await repo().setPassword(auth.athleteId, await hashPassword(req.validatedBody.newPassword))
      res.status(204).end()
    } catch (error) { next(error) }
  })

  router.get('/admin', ...adminGuard, staffLimiter, async (_req, res, next) => {
    try { res.json(await repo().adminData()) } catch (error) { next(error) }
  })
  router.post('/admin/payment-orders/:orderId/approve', ...financeGuard, staffLimiter, async (req, res, next) => {
    try {
      const result = await repo().approvePayment(req.params.orderId)
      res.json(result)
    } catch (error) { next(error) }
  })
  router.post('/admin/:athleteId/credential', ...accountGuard, staffLimiter, validateBody(
    z.object({ password: z.string().min(12).max(72) }),
  ), async (req, res, next) => {
    try {
      const athleteId = z.string().uuid().safeParse(req.params.athleteId)
      if (!athleteId.success) throw new HttpError(400, 'Atleta invalido.')
      await repo().setPassword(athleteId.data, await hashPassword(req.validatedBody.password))
      res.status(204).end()
    } catch (error) { next(error) }
  })

  return router
}
