import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { hasPermission } from '../../src/lib/permissions.js'
import { HttpError } from '../lib/errors.js'
import { validateBody } from '../lib/validate.js'
import { requirePermission } from '../middleware/auth.js'
import { athleteWriteLimiter, publicWriteLimiter, staffLimiter } from '../middleware/rateLimit.js'
import { createBrevoAdapter } from '../modules/notifications/brevoAdapter.js'
import { hashPassword, verifyPassword } from '../services/passwordService.js'
import {
  createPasswordResetToken,
  hashPasswordResetToken,
  verifyPasswordResetToken,
} from '../services/passwordResetToken.js'
import { buildPasswordResetUrl } from '../../src/lib/passwordResetRoute.js'
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
const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Ingresá un correo válido.'),
})
const resetPasswordSchema = z.object({
  token: z.string().trim().min(20, 'El enlace de recuperación no es válido.'),
  password: z
    .string()
    .min(12, 'La contraseña debe tener al menos 12 caracteres.')
    .max(72, 'La contraseña es demasiado larga.'),
})
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

const FORGOT_OK_MESSAGE =
  'Si existe una cuenta con ese correo, te enviamos un enlace para restablecer la contraseña.'

const PASSWORD_RESET_TTL_MS = 1000 * 60 * 30

async function dispatchPasswordResetEmail({ brevo, env, to, name, resetUrl }) {
  const templateId = env.BREVO_TEMPLATE_PASSWORD_RESET
  if (brevo.configured && templateId) {
    await brevo.sendTemplate({
      to,
      templateId,
      params: { name: name || '', resetUrl },
    })
    return 'sent'
  }

  if (brevo.configured) {
    await brevo.sendHtml({
      to,
      subject: 'Restablecé tu contraseña · PLU ARG',
      htmlContent: `
        <p>Hola${name ? ` ${name}` : ''},</p>
        <p>Recibimos un pedido para restablecer tu contraseña en PLU ARG.</p>
        <p><a href="${resetUrl}">Crear nueva contraseña</a></p>
        <p>El enlace vence en 30 minutos. Si no pediste esto, ignorá este correo.</p>
      `,
    })
    return 'sent'
  }

  console.info('[password-reset mock]', { to, resetUrl })
  return 'mocked'
}

export function createAthleteRoutes({ getPrisma, getSupabaseAdmin, repository, env = process.env, brevo }) {
  const router = Router()
  const client = () => getSupabaseAdmin?.()
  const repo = () => repository ?? createSupabaseAthleteRepository(client())
  const athlete = async (req) => requireAthleteSession({ client: client(), req })
  const prisma = getPrisma()
  const adminGuard = requirePermission(
    [
      'admin.athletes.read',
      'admin.memberships.read',
      'admin.registrations.read',
      'admin.payments.read',
      'admin.dashboard.read',
    ],
    { prisma },
    { mode: 'any' },
  )
  const financeGuard = requirePermission('admin.payments.approve', { prisma })
  const accountGuard = requirePermission('admin.athletes.write', { prisma })
  const mailer = brevo ?? createBrevoAdapter({ env })

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

  // Anti-enumeración: siempre 200 con el mismo mensaje, exista o no la cuenta.
  router.post('/forgot-password', publicWriteLimiter, validateBody(forgotPasswordSchema), async (req, res, next) => {
    try {
      const { email } = req.validatedBody
      const row = await repo().findLogin(email)

      if (row && row.status !== 'bloqueado' && row.password_hash) {
        const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS)
        const token = createPasswordResetToken({ athleteId: row.id, expiresAt })
        await repo().createPasswordResetToken(row.id, hashPasswordResetToken(token), expiresAt)
        const appUrl = env.APP_URL ?? env.VITE_APP_URL ?? ''
        const resetUrl = buildPasswordResetUrl(appUrl, token)
        try {
          await dispatchPasswordResetEmail({
            brevo: mailer,
            env,
            to: row.email,
            name: row.full_name,
            resetUrl,
          })
        } catch (mailError) {
          console.warn('[password-reset] no se pudo enviar el email', mailError?.message ?? mailError)
        }
      }

      res.json({ ok: true, message: FORGOT_OK_MESSAGE })
    } catch (error) {
      next(error)
    }
  })

  router.post('/reset-password', publicWriteLimiter, validateBody(resetPasswordSchema), async (req, res, next) => {
    try {
      const payload = verifyPasswordResetToken(req.validatedBody.token)
      if (!payload) {
        throw new HttpError(400, 'El enlace de recuperación no es válido o ya venció.')
      }

      const credential = await repo().credential(payload.aid)
      if (!credential) {
        throw new HttpError(400, 'El enlace de recuperación no es válido o ya venció.')
      }

      const reset = await repo().resetPasswordWithToken({
        athleteId: payload.aid,
        tokenHash: hashPasswordResetToken(req.validatedBody.token),
        passwordHash: await hashPassword(req.validatedBody.password),
      })
      if (!reset) {
        throw new HttpError(400, 'El enlace de recuperacion no es valido o ya vencio.')
      }

      res.json({ ok: true })
    } catch (error) {
      next(error)
    }
  })

  router.get('/session', async (req, res, next) => {
    try {
      const auth = await athlete(req)
      const data = await repo().snapshot(auth.athleteId)
      res.json({
        user: {
          role: 'athlete_plu',
          athleteId: auth.athleteId,
          name: data.athlete.full_name,
          email: data.athlete.email,
          photoUrl: data.athlete.photo_url ?? null,
        },
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

  router.get('/admin', ...adminGuard, staffLimiter, async (req, res, next) => {
    try {
      const data = await repo().adminData()
      const canReadAthletes = hasPermission(req.auth.user, 'admin.athletes.read')
      const canReadMemberships = hasPermission(req.auth.user, 'admin.memberships.read')
      const canReadRegistrations = hasPermission(req.auth.user, 'admin.registrations.read')
      const canReadPayments = hasPermission(req.auth.user, 'admin.payments.read')

      res.json({
        ...data,
        athletes: canReadAthletes ? data.athletes : [],
        memberships: canReadMemberships ? data.memberships : [],
        registrations: canReadRegistrations ? data.registrations : [],
        payments: canReadPayments ? data.payments : [],
      })
    } catch (error) { next(error) }
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
