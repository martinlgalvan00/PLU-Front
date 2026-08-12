import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { hasPermission } from '../../src/lib/permissions.js'
import { HttpError } from '../lib/errors.js'
import {
  assertComboCheckoutAvailable,
  assertRecurringMembershipAvailable,
  isAppProduction,
  isRecurringMembershipPlan,
} from '../lib/featureAvailability.js'
import { validateBody } from '../lib/validate.js'
import { requirePermission, requireRole } from '../middleware/auth.js'
import {
  athleteAuthLimiter,
  athleteWriteLimiter,
  publicReadLimiter,
  publicWriteLimiter,
  staffLimiter,
} from '../middleware/rateLimit.js'
import { createBrevoAdapter } from '../modules/notifications/brevoAdapter.js'
import { createEmailDispatcher } from '../modules/notifications/emailDispatcher.js'
import { buildPaymentConfirmationParams } from '../modules/notifications/paymentNotificationService.js'
import { createSupabaseNotificationRepository } from '../modules/notifications/supabaseNotificationRepository.js'
import {
  anonymousIdentityId,
  recordOperationalAuditEvent,
  requestAuditMetadata,
} from '../modules/audit/operationalAuditWriter.js'
import { hashPassword, verifyPassword } from '../services/passwordService.js'
import {
  createPasswordResetToken,
  hashPasswordResetToken,
  verifyPasswordResetToken,
} from '../services/passwordResetToken.js'
import { buildPasswordResetUrl } from '../../src/lib/passwordResetRoute.js'
import { buildEmailVerificationUrl } from '../../src/lib/emailVerificationRoute.js'
import {
  createEmailVerificationToken,
  verifyEmailVerificationToken,
  EMAIL_VERIFICATION_TTL_MS,
} from '../services/emailVerificationToken.js'
import {
  createEmailVerificationOtp,
  hashEmailVerificationOtp,
  normalizeEmailVerificationOtp,
  EMAIL_OTP_MAX_ATTEMPTS,
  EMAIL_OTP_TTL_MS,
} from '../services/emailVerificationOtp.js'
import {
  assertAthleteOwnsPath,
  createSupabaseAthleteRepository,
} from '../modules/athletes/supabaseAthleteRepository.js'
import {
  ATHLETE_SESSION_COOKIE_NAME,
  createAthleteSession,
  getAthleteSessionCookieOptions,
  getClearAthleteSessionCookieOptions,
  readAthleteSession,
  requireAthleteSession,
  revokeAthleteSession,
} from '../services/athleteSessionService.js'

const COMPETITION_DIVISIONS = ['Open', 'Youth', 'Junior', 'Sub-Masters', 'Masters']
const COMPETITION_CATEGORIES = ['Raw', 'Raw With Wraps', 'Single-Ply', 'Multi-Ply', 'Unlimited']

function todayInBuenosAires() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

const birthDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de nacimiento no es válida.')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number)
    const parsed = new Date(Date.UTC(year, month - 1, day))
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() + 1 !== month ||
      parsed.getUTCDate() !== day
    ) return false

    return value <= todayInBuenosAires()
  }, 'La fecha de nacimiento no puede ser futura ni inexistente.')

// El email se guarda SIEMPRE en minúsculas. `findLogin` busca por
// `email.toLowerCase()`, así que una cuenta dada de alta con cualquier
// mayúscula (el autocompletado del teléfono las mete solo) quedaba
// inalcanzable: no podía loguearse ni recuperar la contraseña, y el índice
// único sobre lower(email) tampoco la dejaba registrarse de nuevo.
const registerSchema = z.object({
  fullName: z.string().trim().min(3),
  // Los separadores se limpian antes de validar: el documento se muestra con
  // puntos en cualquier DNI físico y rechazarlo por eso obligaba a rehacer los
  // dos pasos del alta sin explicar qué estaba mal.
  documentId: z
    .string()
    .trim()
    .transform((value) => value.replace(/[.\-\s]/g, ''))
    .pipe(z.string().regex(/^\d{7,8}$/, 'El documento debe tener 7 u 8 dígitos.')),
  email: z.string().trim().toLowerCase().email(),
  birthDate: birthDateSchema,
  phone: z.string().trim().refine(
    (value) => {
      const digits = value.replace(/\D/g, '')
      return digits.length >= 8 && digits.length <= 15
    },
    'El teléfono debe tener entre 8 y 15 dígitos.',
  ),
  country: z.string().trim().min(2),
  province: z.string().trim().min(2),
  city: z.string().trim().min(2),
  gym: z.string().trim().min(2),
  sex: z.enum(['Masculino', 'Femenino']),
  division: z.enum(COMPETITION_DIVISIONS),
  category: z.enum(COMPETITION_CATEGORIES),
  estimatedWeight: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .refine((value) => {
      if (value === undefined || value === null || String(value).trim() === '') return true
      const parsed = Number(String(value).replace(',', '.').replace(/\s*kg$/i, ''))
      return Number.isFinite(parsed) && parsed >= 10 && parsed <= 250
    }, 'El peso estimado debe estar entre 10 y 250 kg.'),
  password: z.string().min(12).max(72),
})
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(72),
})
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
  // Misma normalización que el alta: editar el perfil con una mayúscula dejaba
  // sin login a una cuenta que venía funcionando.
  email: z.string().trim().toLowerCase().email(), phone: z.string().trim().min(6), city: z.string().trim().min(2),
  province: z.string().trim().min(2), gym: z.string().trim().optional().default(''),
})
const orderSchema = z.object({
  paymentMethod: z.enum(['mercado_pago', 'manual_link']),
  planCode: z.string().trim().min(2).default('plu-annual'),
  idempotencyKey: z.string().uuid().default(() => randomUUID()),
})
const registrationSchema = z.object({
  eventSlug: z.string().trim().min(1),
  division: z.enum(COMPETITION_DIVISIONS),
  category: z.enum(COMPETITION_CATEGORIES),
  bodyweightKg: z.number().min(10).max(250).nullable().optional(),
  paymentMethod: z.enum(['mercado_pago', 'manual_link']),
  idempotencyKey: z.string().uuid().default(() => randomUUID()),
})
const comboRegistrationSchema = registrationSchema
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

const availabilitySchema = z
  .object({
    email: z.string().trim().toLowerCase().email().optional(),
    documentId: z
      .string()
      .trim()
      .transform((value) => value.replace(/[.\-\s]/g, ''))
      .pipe(z.string().regex(/^\d{7,8}$/))
      .optional(),
  })
  .refine((value) => Boolean(value.email || value.documentId), {
    message: 'Indicá un correo o un documento.',
  })

function athleteExistsError(availability) {
  const fields = {}
  if (availability.emailTaken) fields.email = 'taken'
  if (availability.documentTaken) fields.documentId = 'taken'
  const message = availability.emailTaken && !availability.documentTaken
    ? 'Este correo ya tiene una cuenta. Ingresá o usá otro.'
    : availability.documentTaken && !availability.emailTaken
      ? 'Este documento ya tiene una cuenta. Ingresá o usá otro.'
      : 'Ya existe una cuenta con ese correo o documento.'
  return new HttpError(409, message, { code: 'ATHLETE_EXISTS', fields })
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
  const financeReadGuard = requirePermission('admin.payments.read', { prisma })
  const membershipWriteGuard = requirePermission('admin.memberships.write', { prisma })
  const accountGuard = requirePermission('admin.athletes.write', { prisma })
  // Mismo formato que usa el check-in (`server/routes/tickets.js`): el actor
  // queda identificable en `domain_audit_logs` sin depender de que el id de
  // usuario siga existiendo cuando se lea la auditoría.
  const actorLabel = (req) => `${req.auth.user.id}:${req.auth.user.email}`
  const mailer = brevo ?? createBrevoAdapter({ env })
  const appUrl = (env.APP_URL ?? env.VITE_APP_URL ?? '').replace(/\/$/, '')

  function recordFailedLogin(req, email) {
    let auditClient = null
    try {
      auditClient = client()
    } catch {
      auditClient = null
    }
    return recordOperationalAuditEvent(auditClient, {
      source: 'identity',
      action: 'auth.login_failed',
      entityType: 'athlete',
      entityId: anonymousIdentityId('email', email),
      actorType: 'anonymous',
      status: 'failed',
      severity: 'warning',
      metadata: requestAuditMetadata(req, { method: 'password', reason: 'invalid_credentials' }),
    })
  }

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

  async function sendOnboardingEmails(row) {
    // Un solo mail de alta: bienvenida + confirmación + OTP.
    // Antes salían `welcome` y `email_verification` en paralelo y duplicaban
    // la bandeja del atleta con dos asuntos distintos.
    return sendVerificationEmail(row)
  }

  async function sendVerificationEmail(row) {
    const token = createEmailVerificationToken({
      athleteId: row.id,
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      secret: env.AUTH_SECRET,
    })
    const verificationCode = createEmailVerificationOtp()
    const codeHash = hashEmailVerificationOtp(verificationCode)
    const otpExpiresAt = new Date(Date.now() + EMAIL_OTP_TTL_MS)

    try {
      await repo().storeEmailOtp(row.id, codeHash, otpExpiresAt)
    } catch (error) {
      console.warn('[email:otp] no se pudo guardar el código', error?.message ?? error)
    }

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
        verificationCode,
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
      // El texto no promete un reenvío que nadie dispara: el enlace sale solo
      // si el atleta lo pide, y el `code` es lo que habilita ese botón en la
      // pantalla donde se cortó el checkout.
      throw new HttpError(403, 'Confirmá tu correo antes de continuar. Revisá tu bandeja o pedí un enlace nuevo.', {
        code: 'EMAIL_NOT_VERIFIED',
      })
    }
  }

  // Público y rate-limited: el wizard pregunta al salir del campo si el
  // correo/documento ya están tomados, antes de pedir el resto del perfil.
  router.post(
    '/check-availability',
    publicWriteLimiter,
    validateBody(availabilitySchema),
    async (req, res, next) => {
      try {
        const availability = await repo().checkAvailability(req.validatedBody)
        res.json(availability)
      } catch (error) {
        next(error)
      }
    },
  )

  router.post('/register', publicWriteLimiter, validateBody(registerSchema), async (req, res, next) => {
    try {
      const { password, ...form } = req.validatedBody
      // Pre-check con campos concretos: PLU07 del unique es ambiguo
      // (email o documento) y el formulario no sabía qué corregir.
      const availability = await repo().checkAvailability({
        email: form.email,
        documentId: form.documentId,
      })
      if (availability.emailTaken || availability.documentTaken) {
        throw athleteExistsError(availability)
      }
      const row = await repo().register(form, await hashPassword(password))
      const session = await createAthleteSession({ client: client(), athleteId: row.id, req })
      res.cookie(ATHLETE_SESSION_COOKIE_NAME, session.token, getAthleteSessionCookieOptions(env))
      // La operación de negocio ya quedó confirmada. El dispatcher reserva el
      // outbox antes de llamar a Brevo; esperar este best-effort garantiza que
      // el email crítico quede enviado o programado para reintento antes de que
      // una función serverless pueda finalizar después de responder.
      await sendOnboardingEmails(row).catch((error) =>
        console.warn('[onboarding] no se pudieron enviar los emails de alta', error?.message ?? error),
      )
      res.status(201).json({ athlete: row })
    } catch (error) {
      // Carrera entre dos altas: el unique sigue siendo PLU07. Traducimos a
      // ATHLETE_EXISTS genérico para que el front muestre el mismo copy.
      if (error instanceof HttpError && error.details?.code === 'PLU07') {
        next(new HttpError(409, 'Ya existe una cuenta con ese correo o documento.', {
          code: 'ATHLETE_EXISTS',
          fields: { email: 'taken', documentId: 'taken' },
        }))
        return
      }
      next(error)
    }
  })

  /**
   * Foto firmada para la página pública de verificación QR. Sin sesión: el
   * código tiene que ser el token del QR (la RPC no expone photo_path por
   * member_code). Rate-limited como el resto de lecturas públicas.
   */
  router.get('/public/credential-photo', publicReadLimiter, async (req, res, next) => {
    try {
      const code = String(req.query.code ?? '').trim()
      if (!code) throw new HttpError(400, 'Falta el código de credencial.')
      res.json(await repo().signCredentialPhoto(code))
    } catch (error) {
      next(error)
    }
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

  // Confirma el correo con el OTP del mail cuando el deep link no abre.
  router.post(
    '/me/verify-email-code',
    athleteWriteLimiter,
    validateBody(
      z.object({
        code: z
          .string()
          .trim()
          .regex(/^\d{6}$/, 'Ingresá el código de 6 dígitos del correo.'),
      }),
    ),
    async (req, res, next) => {
      try {
        const auth = await athlete(req)
        const code = normalizeEmailVerificationOtp(req.validatedBody.code)
        if (!code) {
          throw new HttpError(400, 'Ingresá el código de 6 dígitos del correo.')
        }

        const result = await repo().verifyEmailWithOtp(
          auth.athleteId,
          hashEmailVerificationOtp(code),
          EMAIL_OTP_MAX_ATTEMPTS,
        )

        if (result?.verified) {
          res.json({
            ok: true,
            email: result.email,
            alreadyVerified: Boolean(result.alreadyVerified),
          })
          return
        }

        const reason = result?.reason
        if (reason === 'locked') {
          throw new HttpError(429, 'Demasiados intentos. Pedí un código nuevo desde Mi cuenta.', {
            code: 'EMAIL_OTP_LOCKED',
          })
        }
        if (reason === 'expired') {
          throw new HttpError(400, 'El código venció. Pedí uno nuevo desde Mi cuenta.', {
            code: 'EMAIL_OTP_EXPIRED',
          })
        }
        throw new HttpError(400, 'El código no es válido. Revisalo e intentá de nuevo.', {
          code: 'EMAIL_OTP_INVALID',
        })
      } catch (error) {
        next(error)
      }
    },
  )

  // Preset de riesgo de autenticación (no el de escritura pública, que era más
  // permisivo), pero con instancia propia: `authLimiter` lo comparte el login
  // de staff, que el cliente prueba primero en cada intento (ver
  // athleteAuthLimiter en middleware/rateLimit.js).
  router.post('/login', athleteAuthLimiter, validateBody(loginSchema), async (req, res, next) => {
    try {
      const row = await repo().findLogin(req.validatedBody.email)
      // Igual que en el login de staff: bcrypt corre siempre, exista o no la
      // cuenta, para que el tiempo de respuesta no enumere el padrón.
      const passwordMatches = await verifyPassword(req.validatedBody.password, row?.password_hash)

      if (!row || row.status === 'bloqueado' || !passwordMatches) {
        await recordFailedLogin(req, req.validatedBody.email)
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

  // Probe de bootstrap (igual que /api/auth/me): sin cookie responde 200 +
  // user null para que el restore anónimo no figure como error en DevTools.
  router.get('/session', async (req, res, next) => {
    try {
      const auth = await readAthleteSession({
        client: client(),
        token: req.cookies?.[ATHLETE_SESSION_COOKIE_NAME],
      })
      if (!auth) {
        res.json({ user: null })
        return
      }

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
      const plan = await repo().findMembershipPlan(req.validatedBody.planCode)
      if (!plan) throw new HttpError(404, 'Plan de afiliacion no encontrado.')
      if (isAppProduction(env) && isRecurringMembershipPlan(plan)) {
        assertRecurringMembershipAvailable(env)
      }
      res.status(201).json(await repo().createMembershipOrder(auth.athleteId, {
        ...req.validatedBody,
        planCode: plan.code,
      }))
    } catch (error) { next(error) }
  })
  router.post('/me/registrations', publicWriteLimiter, validateBody(registrationSchema), async (req, res, next) => {
    try {
      const auth = await athlete(req)
      await assertEmailVerified(auth.athleteId)
      res.status(201).json(await repo().createRegistration(auth.athleteId, req.validatedBody))
    } catch (error) { next(error) }
  })
  router.post(
    '/me/registration-combos',
    publicWriteLimiter,
    validateBody(comboRegistrationSchema),
    async (req, res, next) => {
      try {
        assertComboCheckoutAvailable(env)
        const auth = await athlete(req)
        await assertEmailVerified(auth.athleteId)
        res.status(201).json(await repo().createRegistrationCombo(auth.athleteId, req.validatedBody))
      } catch (error) { next(error) }
    },
  )
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
      // setPassword revoca TODAS las sesiones del atleta, incluida ésta: es el
      // punto del cambio de contraseña (si la cuenta estaba tomada, el atacante
      // se queda afuera). Para no expulsar también a quien la acaba de cambiar,
      // se emite una sesión nueva y se pisa la cookie.
      await repo().setPassword(auth.athleteId, await hashPassword(req.validatedBody.newPassword))
      const session = await createAthleteSession({ client: client(), athleteId: auth.athleteId, req })
      res.cookie(ATHLETE_SESSION_COOKIE_NAME, session.token, getAthleteSessionCookieOptions(env))
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
        athletes: canReadAthletes ? data.athletes : [],
        memberships: canReadMemberships ? data.memberships : [],
        registrations: canReadRegistrations ? data.registrations : [],
        // El adaptador del frontend normaliza `paymentOrders`. Antes se
        // agregaba `payments: []`, pero `...data` seguía exponiendo las
        // órdenes aunque el rol no tuviera admin.payments.read.
        paymentOrders: canReadPayments ? data.paymentOrders : [],
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
    // La fila de inscripción que devuelve la RPC solo trae `event_id`; se
    // completa antes de armar el único mail para que no pierda información.
    const registrationEvent = result.registration?.event_id
      ? await repo().findEventSummary(result.registration.event_id)
      : null

    await sendBestEffort('payment_confirmation', {
      ...common,
      idempotencyKey: `email:payment-confirmation:manual:${order.id}`,
      params: buildPaymentConfirmationParams({
        order: { ...order, kind: 'athlete' },
        payment: {
          amount: order.amount,
          paidAt: order.approved_at ?? new Date().toISOString(),
          paymentMethod: order.method,
        },
        result,
        recipientName: athlete.full_name,
        appUrl,
        registrationEvent,
      }),
    })
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
  router.post('/admin/memberships/:membershipId/status', ...membershipWriteGuard, staffLimiter, validateBody(
    z.object({ status: z.enum(['activa', 'cancelada']) }),
  ), async (req, res, next) => {
    try {
      const membershipId = z.string().uuid().safeParse(req.params.membershipId)
      if (!membershipId.success) throw new HttpError(400, 'Afiliación inválida.')
      const result = await repo().setMembershipStatus(
        membershipId.data,
        req.validatedBody.status,
        actorLabel(req),
      )

      const membership = result?.membership
      if (membership?.athlete_id && !result?.duplicate) {
        try {
          const contact = await repo().findContact(membership.athlete_id)
          if (contact?.email) {
            const type = req.validatedBody.status === 'activa'
              ? 'affiliation_approved'
              : 'affiliation_cancelled'
            await sendBestEffort(type, {
              to: contact.email,
              toName: contact.full_name,
              entityType: 'membership',
              entityId: membership.id,
              // `updated_at` identifica esta transición concreta: repetir el
              // mismo request es idempotente, pero una baja y reactivación
              // posterior de la misma afiliación sí merece un aviso nuevo.
              idempotencyKey: type === 'affiliation_approved'
                ? `email:affiliation-approved:${membership.id}:manual:${membership.updated_at}`
                : `email:affiliation-cancelled:${membership.id}:manual:${membership.updated_at}`,
              params: type === 'affiliation_approved'
                ? {
                    name: contact.full_name,
                    memberCode: membership.member_code,
                    expirationDate: membership.expiration_date,
                    accountUrl: `${appUrl}/mi-cuenta`,
                  }
                : {
                    name: contact.full_name,
                    memberCode: membership.member_code,
                    status: membership.status,
                    accountUrl: `${appUrl}/mi-cuenta`,
                  },
            })
          }
        } catch (notificationError) {
          console.warn(
            '[membership-status] no se pudo reservar la notificación',
            notificationError?.message ?? notificationError,
          )
        }
      }

      res.json(result)
    } catch (error) { next(error) }
  })
  // Rota la credencial de la persona. Es la que hay que usar cuando un token
  // se filtró: la de afiliación solo alcanza a las cards del modelo viejo.
  router.post('/admin/:athleteId/rotate-credential', ...membershipWriteGuard, staffLimiter, async (req, res, next) => {
    try {
      const athleteId = z.string().uuid().safeParse(req.params.athleteId)
      if (!athleteId.success) throw new HttpError(400, 'Atleta inválido.')
      res.json(await repo().rotateAthleteCredentialToken(athleteId.data, actorLabel(req)))
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

  /**
   * Borrado definitivo del atleta y todo lo asociado (afiliaciones,
   * inscripciones, ordenes, sesiones, foto). Solo Super Admin, igual que el
   * borrado de cuentas de staff: es la accion mas destructiva del panel y no
   * tiene vuelta atras. La cascada y la auditoria viven en la RPC
   * delete_athlete (20260810230000_athlete_hard_delete.sql).
   */
  const deleteGuard = requireRole(['admin_maximal'], { prisma })
  router.delete('/admin/:athleteId', ...deleteGuard, staffLimiter, async (req, res, next) => {
    try {
      const athleteId = z.string().uuid().safeParse(req.params.athleteId)
      if (!athleteId.success) throw new HttpError(400, 'Atleta inválido.')
      const deleted = await repo().deleteAthlete(athleteId.data, actorLabel(req))
      res.json({ deletedAthlete: deleted })
    } catch (error) { next(error) }
  })

  return router
}
