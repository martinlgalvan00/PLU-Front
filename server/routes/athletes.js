import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { hasPermission } from '../../src/lib/permissions.js'
import { HttpError } from '../lib/errors.js'
import { validateBody } from '../lib/validate.js'
import { requirePermission } from '../middleware/auth.js'
import { athleteWriteLimiter, publicWriteLimiter, staffLimiter } from '../middleware/rateLimit.js'
import { createBrevoAdapter } from '../modules/notifications/brevoAdapter.js'
import { createEmailDispatcher } from '../modules/notifications/emailDispatcher.js'
import { createSupabaseNotificationRepository } from '../modules/notifications/supabaseNotificationRepository.js'
import { hashPassword, verifyPassword } from '../services/passwordService.js'
import {
  createPasswordResetToken,
  hashPasswordResetToken,
  verifyPasswordResetToken,
} from '../services/passwordResetToken.js'
import { buildPasswordResetUrl } from '../../src/lib/passwordResetRoute.js'
import { buildEmailVerificationUrl } from '../../src/lib/emailVerificationRoute.js'
import { buildEventPagePath } from '../../src/lib/eventPageRoute.js'
import {
  createEmailVerificationToken,
  verifyEmailVerificationToken,
  EMAIL_VERIFICATION_TTL_MS,
} from '../services/emailVerificationToken.js'
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
const proofUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(120),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  size: z.number().int().positive().max(5 * 1024 * 1024),
})
const proofSchema = z.object({ proofPath: z.string().trim().min(3).max(300) })
const paymentOrdersQuerySchema = z.object({
  status: z.enum(['pendiente', 'validacion_manual', 'aprobado', 'rechazado', 'cancelado', 'reembolsado']).optional(),
  method: z.enum(['mercado_pago', 'manual_link']).optional(),
  concept: z.enum(['membership', 'registration', 'combo']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
})

const FORGOT_OK_MESSAGE =
  'Si existe una cuenta con ese correo, te enviamos un enlace para restablecer la contraseña.'

const PASSWORD_RESET_TTL_MS = 1000 * 60 * 30

const PASSWORD_RESET_TTL_MINUTES = PASSWORD_RESET_TTL_MS / 60_000

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
  const financeReadGuard = requirePermission('admin.payments.read', { prisma })
  const membershipWriteGuard = requirePermission('admin.memberships.write', { prisma })
  const accountGuard = requirePermission('admin.athletes.write', { prisma })
  // Mismo formato que usa el check-in (`server/routes/tickets.js`): el actor
  // queda identificable en `domain_audit_logs` sin depender de que el id de
  // usuario siga existiendo cuando se lea la auditoría.
  const actorLabel = (req) => `${req.auth.user.id}:${req.auth.user.email}`
  const mailer = brevo ?? createBrevoAdapter({ env })
  const appUrl = (env.APP_URL ?? env.VITE_APP_URL ?? '').replace(/\/$/, '')

  // Un solo dispatcher para los emails de esta ruta. Sin Supabase queda en
  // modo degradado (envía sin log) en vez de romper el armado de la app.
  function mailDispatcher() {
    let notificationRepository = null
    try {
      const supabase = client()
      if (supabase) notificationRepository = createSupabaseNotificationRepository(supabase)
    } catch {
      notificationRepository = null
    }
    return createEmailDispatcher({ repository: notificationRepository, brevo: mailer, env })
  }

  /**
   * Los emails de esta ruta son best-effort: el alta y el pedido de
   * recuperación ya se completaron en la DB antes de llegar acá, así que un
   * fallo de Brevo no puede tirar el request.
   */
  async function sendBestEffort(type, input) {
    try {
      await mailDispatcher().send(type, input)
    } catch (error) {
      console.warn(`[email:${type}] no se pudo enviar`, error?.message ?? error)
    }
  }

  /**
   * Bienvenida + pedido de verificación. Van como dos emails y no uno: el de
   * bienvenida es informativo y el de verificación tiene una sola acción
   * clara. Mezclarlos hace que el link se pierda entre el resto del texto.
   */
  async function sendOnboardingEmails(row) {
    await sendBestEffort('welcome', {
      to: row.email,
      toName: row.full_name,
      entityType: 'athlete',
      entityId: row.id,
      params: { name: row.full_name, accountUrl: `${appUrl}/mi-cuenta` },
    })
    await sendVerificationEmail(row)
  }

  function sendVerificationEmail(row) {
    const token = createEmailVerificationToken({
      athleteId: row.id,
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      secret: env.AUTH_SECRET,
    })
    return sendBestEffort('email_verification', {
      to: row.email,
      toName: row.full_name,
      entityType: 'athlete',
      entityId: row.id,
      // Un reenvío tiene que llegar de verdad, así que la clave lleva la
      // marca de tiempo: si no, la idempotencia lo descartaría en silencio.
      idempotencyKey: `email:verification:${row.id}:${Date.now()}`,
      params: {
        name: row.full_name,
        verificationUrl: buildEmailVerificationUrl(env.APP_URL ?? env.VITE_APP_URL ?? '', token),
      },
    })
  }

  /**
   * Afiliarse e inscribirse exigen email confirmado: son las dos acciones que
   * terminan en un pago, y mandar un comprobante a una dirección con un typo
   * deja al atleta sin constancia y sin forma de reclamar.
   */
  async function assertEmailVerified(athleteId) {
    const contact = await repo().findContact(athleteId)
    if (contact && !contact.email_verified_at) {
      throw new HttpError(403, 'Confirmá tu correo antes de continuar. Te reenviamos el enlace desde tu cuenta.', {
        code: 'EMAIL_NOT_VERIFIED',
      })
    }
  }

  router.post('/register', publicWriteLimiter, validateBody(registerSchema), async (req, res, next) => {
    try {
      const { password, ...form } = req.validatedBody
      const row = await repo().register(form, await hashPassword(password))
      const session = await createAthleteSession({ client: client(), athleteId: row.id, req })
      res.cookie(ATHLETE_SESSION_COOKIE_NAME, session.token, getAthleteSessionCookieOptions(env))
      await sendOnboardingEmails(row)
      res.status(201).json({ athlete: row })
    } catch (error) { next(error) }
  })

  // Público: el link llega por email y se abre sin sesión iniciada.
  router.post('/verify-email', publicWriteLimiter, validateBody(
    z.object({ token: z.string().trim().min(20, 'El enlace de verificación no es válido.') }),
  ), async (req, res, next) => {
    try {
      const payload = verifyEmailVerificationToken(req.validatedBody.token, { secret: env.AUTH_SECRET })
      if (!payload) {
        throw new HttpError(400, 'El enlace de verificación no es válido o ya venció.')
      }
      const result = await repo().verifyEmail(payload.aid)
      if (!result?.verified) {
        throw new HttpError(400, 'El enlace de verificación no es válido o ya venció.')
      }
      res.json({ ok: true, email: result.email })
    } catch (error) { next(error) }
  })

  router.post('/me/resend-verification', athleteWriteLimiter, async (req, res, next) => {
    try {
      const auth = await athlete(req)
      const contact = await repo().findContact(auth.athleteId)
      if (!contact) throw new HttpError(404, 'Cuenta no encontrada.')
      if (contact.email_verified_at) {
        res.json({ ok: true, alreadyVerified: true })
        return
      }
      await sendVerificationEmail(contact)
      res.json({ ok: true, alreadyVerified: false })
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
        const resetUrl = buildPasswordResetUrl(env.APP_URL ?? env.VITE_APP_URL ?? '', token)
        await sendBestEffort('password_reset', {
          to: row.email,
          toName: row.full_name,
          entityType: 'athlete',
          entityId: row.id,
          // Cada pedido genera un token nuevo, así que la clave lleva el
          // vencimiento: si el atleta pide dos veces, recibe dos enlaces.
          idempotencyKey: `email:password-reset:${row.id}:${expiresAt.getTime()}`,
          params: {
            name: row.full_name,
            resetUrl,
            expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
          },
        })
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
    try {
      const auth = await athlete(req)
      await assertEmailVerified(auth.athleteId)
      res.status(201).json(await repo().createMembershipOrder(auth.athleteId, req.validatedBody))
    } catch (error) { next(error) }
  })
  router.post('/me/registrations', publicWriteLimiter, validateBody(registrationSchema), async (req, res, next) => {
    try {
      const auth = await athlete(req)
      await assertEmailVerified(auth.athleteId)
      res.status(201).json(await repo().createRegistration(auth.athleteId, req.validatedBody))
    } catch (error) { next(error) }
  })
  /**
   * Comprobante de transferencia. Las órdenes de entrada ya tenían el ciclo
   * completo (subida firmada + revisión); las de afiliación tenían las
   * columnas en la tabla desde la fase 2 pero nada que las escribiera, así que
   * Finanzas aprobaba sin evidencia adjunta.
   */
  router.post('/me/payment-orders/:orderId/proof-upload', athleteWriteLimiter, validateBody(proofUploadSchema), async (req, res, next) => {
    try {
      const auth = await athlete(req)
      const orderId = z.string().uuid().safeParse(req.params.orderId)
      if (!orderId.success) throw new HttpError(400, 'Orden inválida.')
      res.json(await repo().createPaymentProofUpload(auth.athleteId, orderId.data, req.validatedBody.fileName))
    } catch (error) { next(error) }
  })
  router.post('/me/payment-orders/:orderId/proof', athleteWriteLimiter, validateBody(proofSchema), async (req, res, next) => {
    try {
      const auth = await athlete(req)
      const orderId = z.string().uuid().safeParse(req.params.orderId)
      if (!orderId.success) throw new HttpError(400, 'Orden inválida.')
      res.json(await repo().registerPaymentProof(auth.athleteId, orderId.data, req.validatedBody.proofPath))
    } catch (error) { next(error) }
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
  /**
   * Aprobación manual (transferencia, link de pago). Los emails salen de acá y
   * no del frontend: antes los disparaba `useAppData.handleApprovePayment` con
   * el adaptador del browser, que resolvía el template desde variables
   * `VITE_*` y no dejaba registro en `transactional_email_logs`. El camino de
   * Mercado Pago ya notificaba server-side; ahora los dos coinciden.
   */
  async function notifyManualApproval(result) {
    const order = result?.order
    if (!order?.athlete_id) return

    const athlete = await repo().findContact(order.athlete_id)
    if (!athlete?.email) return

    const common = {
      to: athlete.email,
      toName: athlete.full_name,
      entityType: 'athlete_payment_order',
      entityId: order.id,
    }
    const money = { name: athlete.full_name, amount: order.amount, reference: order.reference }

    await sendBestEffort('payment_approved', {
      ...common,
      idempotencyKey: `email:payment-approved:manual:${order.id}`,
      params: { ...money, concept: order.concept },
    })
    await sendBestEffort('payment_receipt', {
      ...common,
      idempotencyKey: `email:payment-receipt:manual:${order.id}`,
      params: { ...money, concept: order.concept, paidAt: new Date().toISOString(), paymentMethod: order.method },
    })

    if (result.membership) {
      await sendBestEffort('affiliation_approved', {
        ...common,
        entityType: 'membership',
        entityId: result.membership.id,
        idempotencyKey: `email:affiliation-approved:${result.membership.id}`,
        params: {
          name: athlete.full_name,
          memberCode: result.membership.member_code,
          expirationDate: result.membership.expiration_date,
          accountUrl: `${appUrl}/mi-cuenta`,
        },
      })
    }

    if (result.registration) {
      // La fila de inscripción solo trae `event_id`; el título sale del evento.
      const event = result.registration.event_id
        ? await repo().findEventSummary(result.registration.event_id)
        : null
      if (event?.title) {
        await sendBestEffort('registration_confirmed', {
          ...common,
          entityType: 'event_registration',
          entityId: result.registration.id,
          idempotencyKey: `email:registration-confirmed:${result.registration.id}`,
          params: {
            name: athlete.full_name,
            eventTitle: event.title,
            eventDate: event.starts_at,
            venue: event.venue ?? '',
            division: result.registration.division,
            category: result.registration.category,
            eventUrl: `${appUrl}${buildEventPagePath(event.slug)}`,
          },
        })
      }
    }
  }

  /**
   * Bandeja de órdenes de atleta. Antes la única forma de llegar a una orden
   * de afiliación pendiente era entrar atleta por atleta desde el padrón, y el
   * acceso directo del dashboard llevaba a una sección que ni siquiera las
   * renderizaba.
   */
  router.get('/admin/payment-orders', ...financeReadGuard, staffLimiter, async (req, res, next) => {
    try {
      const parsed = paymentOrdersQuerySchema.safeParse(req.query)
      if (!parsed.success) throw new HttpError(400, 'Filtros de pago inválidos.')
      res.json({ orders: await repo().listPaymentOrders(parsed.data) })
    } catch (error) { next(error) }
  })
  router.get('/admin/payment-orders/:orderId/proof-url', ...financeReadGuard, staffLimiter, async (req, res, next) => {
    try {
      const orderId = z.string().uuid().safeParse(req.params.orderId)
      if (!orderId.success) throw new HttpError(400, 'Orden inválida.')
      res.json({ url: await repo().paymentProofUrl(orderId.data) })
    } catch (error) { next(error) }
  })
  router.post('/admin/payment-orders/:orderId/approve', ...financeGuard, staffLimiter, async (req, res, next) => {
    try {
      const result = await repo().approvePayment(req.params.orderId, actorLabel(req))
      // Best-effort: el pago ya quedó acreditado, un fallo de email no lo revierte.
      await notifyManualApproval(result).catch((error) =>
        console.warn('[payment-approval] no se pudieron enviar los emails', error?.message ?? error),
      )
      res.json(result)
    } catch (error) { next(error) }
  })
  /**
   * Credencial de un socio desde el panel: hasta ahora no había forma de ver
   * el QR emitido, y si un token se filtraba la única salida era editar la
   * fila a mano en la base.
   */
  router.get('/admin/memberships/:membershipId/credential', ...adminGuard, staffLimiter, async (req, res, next) => {
    try {
      if (!hasPermission(req.auth.user, 'admin.memberships.read')) {
        throw new HttpError(403, 'Sin permisos para ver afiliaciones.')
      }
      const membershipId = z.string().uuid().safeParse(req.params.membershipId)
      if (!membershipId.success) throw new HttpError(400, 'Afiliación inválida.')
      res.json({ membership: await repo().membershipCredential(membershipId.data) })
    } catch (error) { next(error) }
  })
  router.post('/admin/memberships/:membershipId/rotate-qr', ...membershipWriteGuard, staffLimiter, async (req, res, next) => {
    try {
      const membershipId = z.string().uuid().safeParse(req.params.membershipId)
      if (!membershipId.success) throw new HttpError(400, 'Afiliación inválida.')
      res.json(await repo().rotateMembershipQrToken(membershipId.data, actorLabel(req)))
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
