import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { hasPermission } from '../../src/lib/permissions.js'
import { HttpError } from '../lib/errors.js'
import {
  assertComboCheckoutAvailable,
  assertPaidCheckoutAvailable,
  assertRecurringMembershipAvailable,
  isRecurringMembershipPlan,
  resolvePaidCheckoutOverride,
} from '../lib/featureAvailability.js'
import { resolveDeploymentAppUrl } from '../lib/deploymentEnvironment.js'
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
  athleteAuthLimiter,
  athleteWriteLimiter,
  publicReadLimiter,
  publicWriteLimiter,
  registrationAccessCodeLimiter,
  staffLimiter,
} from '../middleware/rateLimit.js'
import { passwordHashShedder } from '../middleware/loadShedder.js'
import {
  assertIdentityNotLocked,
  clearIdentityFailures,
  IDENTITY_SCOPES,
  registerIdentityFailure,
} from '../lib/defense/identityGuard.js'
import { createBrevoAdapter } from '../modules/notifications/brevoAdapter.js'
import {
  checkoutPriceFor,
  isManualPaymentMethod,
  manualPaymentChannel,
  storagePaymentMethod,
} from '../modules/pricing/checkoutPricePolicy.js'
import { createEmailDispatcher } from '../modules/notifications/emailDispatcher.js'
import {
  buildPaymentConfirmationParams,
  displayPaymentConcept,
} from '../modules/notifications/paymentNotificationService.js'
import { createSupabaseNotificationRepository } from '../modules/notifications/supabaseNotificationRepository.js'
import {
  anonymousIdentityId,
  recordOperationalAuditEvent,
  requestAuditMetadata,
} from '../modules/audit/operationalAuditWriter.js'
import {
  PAYMENT_TRAIL_ACTIONS,
  createPaymentAuditTrail,
} from '../modules/payments/paymentAuditTrail.js'
import { diagnosePaymentFailure } from '../modules/payments/paymentFailureCatalog.js'
import { logger } from '../lib/logger.js'
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
import { createSupabaseRegistrationAccessRepository } from '../modules/registrationAccess/supabaseRegistrationAccessRepository.js'
import {
  assertRegistrationAccessCode,
  resolveRegistrationAccessRequirements,
} from '../services/registrationAccessService.js'
import { createSupabasePlatformSettingsRepository } from '../modules/settings/supabasePlatformSettingsRepository.js'
import {
  assertCheckoutEnabled,
  assertConceptValidationEnabled,
  assertManualChannelEnabled,
  assertMembershipCheckoutEnabled,
  assertRegistrationCheckoutEnabled,
  assertValidationEnabled,
  resolvePublicCheckoutAvailability,
} from '../services/platformFeatureToggleService.js'
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
    .transform((value) => value.replace(/[.\-\s]/g, '')),
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
}).superRefine((data, ctx) => {
  const isArgentina = data.country === 'Argentina' || !data.country
  if (isArgentina) {
    if (!/^\d{7,8}$/.test(data.documentId)) {
      ctx.addIssue({
        path: ['documentId'],
        code: z.ZodIssueCode.custom,
        message: 'El documento debe tener 7 u 8 dígitos.',
      })
    }
  } else {
    if (data.documentId.length < 5 || data.documentId.length > 20) {
      ctx.addIssue({
        path: ['documentId'],
        code: z.ZodIssueCode.custom,
        message: 'El pasaporte o ID debe tener entre 5 y 20 caracteres.',
      })
    }
  }
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
const optionalPhone = z.string().trim().max(40).default('').refine((value) => {
  const digits = value.replace(/\D/g, '')
  return !value || (digits.length >= 8 && digits.length <= 15)
}, 'Ingresá un teléfono válido con código de área.')
const optionalDeclaredBestTotal = z.preprocess((value) => {
  if (value === undefined || value === null || String(value).trim() === '') return null
  return Number(String(value).replace(',', '.').replace(/\s*kg$/i, ''))
}, z.number().finite().min(10).max(2000).nullable())

const updateSchema = z.object({
  // Misma normalización que el alta: editar el perfil con una mayúscula dejaba
  // sin login a una cuenta que venía funcionando.
  email: z.string().trim().toLowerCase().email(), phone: z.string().trim().min(6), city: z.string().trim().min(2),
  province: z.string().trim().min(2), gym: z.string().trim().optional().default(''),
  emergencyContactName: z.string().trim().max(120).default(''),
  emergencyContactPhone: optionalPhone,
  instagramHandle: z.string().trim().max(31).default('').transform((value) => value.replace(/^@/, '')).refine(
    (value) => !value || /^[A-Za-z0-9._]{1,30}$/.test(value),
    'Ingresá sólo tu usuario de Instagram, sin espacios ni enlace.',
  ),
  bestTotalKg: optionalDeclaredBestTotal,
  fullName: z.string().trim().min(3).max(160).optional(),
  birthDate: birthDateSchema.optional(),
  country: z.string().trim().min(2).max(80).optional(),
  // Puede faltar en cuentas creadas antes de que existiera el perfil
  // competitivo. Es editable sólo para completar ese requisito de inscripción.
  sex: z.enum(['Masculino', 'Femenino']).optional(),
})
const discountCodeField = z.string().trim().toUpperCase().max(32).optional()
const registrationAccessCodeField = z.string().trim().max(72).optional()

const orderSchema = z.object({
  paymentMethod: z.enum(['mercado_pago', 'manual_link', 'cash_pitbull']),
  planCode: z.string().trim().min(2).default('plu-annual'),
  idempotencyKey: z.string().uuid().default(() => randomUUID()),
  discountCode: discountCodeField,
  accessCode: registrationAccessCodeField,
})
const registrationSchema = z.object({
  eventSlug: z.string().trim().min(1),
  division: z.enum(COMPETITION_DIVISIONS),
  category: z.enum(COMPETITION_CATEGORIES),
  bodyweightKg: z.number().min(10).max(250).nullable().optional(),
  paymentMethod: z.enum(['mercado_pago', 'manual_link', 'cash_pitbull']),
  idempotencyKey: z.string().uuid().default(() => randomUUID()),
  discountCode: discountCodeField,
  accessCode: registrationAccessCodeField,
})
// comboRegistrationSchema hereda discountCode de registrationSchema, pero no
// se reenvia al RPC de combo: los cupones quedan fuera de scope para el
// combo por decision de producto (ver create_membership_registration_combo_order).
const comboRegistrationSchema = registrationSchema.extend({
  membershipAccessCode: registrationAccessCodeField,
  registrationAccessCode: registrationAccessCodeField,
})

/**
 * Chequeo previo del código de tanda, para que el modal pueda decir "código
 * incorrecto" antes de que el atleta cargue todo el checkout. No habilita nada
 * por sí solo: el alta de orden vuelve a validar el mismo código contra el
 * hash, así que saltearse este endpoint no abre ninguna puerta.
 */
const registrationAccessVerifySchema = z.object({
  scope: z.enum(['membership', 'registration']),
  eventSlug: z.string().trim().min(1).max(120).optional(),
  code: z.string().trim().min(1).max(72),
})

const discountPreviewSchema = z.object({
  code: z.string().trim().toUpperCase().min(1).max(32),
  appliesTo: z.enum(['membership', 'registration']),
  planCode: z.string().trim().min(1).optional(),
  eventSlug: z.string().trim().min(1).optional(),
  // El precio vigente depende del canal (transferencia y efectivo pagan menos
  // que Mercado Pago). Sin este dato el preview calculaba el ahorro sobre el
  // precio de catálogo y le mostraba al atleta un número que no era el que
  // terminaba pagando.
  paymentMethod: z.enum(['mercado_pago', 'manual_link', 'cash_pitbull']).optional(),
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
const rejectPaymentSchema = z.object({ reason: z.string().trim().min(3).max(500) })
// El motivo es obligatorio: acreditar a mano una orden que el proveedor dio por
// perdida es la única operación del panel que crea dinero en el reporte
// financiero sin que ningún proveedor lo haya confirmado.
const forceSettlePaymentSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  reference: z.string().trim().max(120).optional(),
})
const registrationStatusSchema = z.object({
  status: z.enum(['confirmada', 'observada', 'cancelada']),
  reason: z.string().trim().min(3).max(500),
})
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

export function createAthleteRoutes({
  getPrisma,
  getSupabaseAdmin,
  repository,
  registrationAccessRepository,
  platformSettingsRepository,
  env = process.env,
  brevo,
}) {
  const router = Router()
  const client = () => getSupabaseAdmin?.()
  const repo = () => repository ?? createSupabaseAthleteRepository(client())
  const accessRepo = () => {
    // Los dobles históricos de tests no conocen la tabla de tandas. En el
    // runtime real no hay bypass: la ausencia de tabla/servicio falla cerrada.
    if (!registrationAccessRepository && (env.NODE_ENV ?? process.env.NODE_ENV) === 'test') {
      return { findActiveGate: async () => null, recordUse: async () => null }
    }
    return registrationAccessRepository ?? createSupabaseRegistrationAccessRepository(client())
  }
  const platformSettingsRepo = () => {
    // Mismo criterio que accessRepo: los dobles de test no conocen la tabla
    // de interruptores, así que en test quedan abiertos por defecto (igual
    // que la columna `default true` de la migración). En runtime real no hay
    // bypass.
    if (!platformSettingsRepository && (env.NODE_ENV ?? process.env.NODE_ENV) === 'test') {
      // Vacío = abierto: los asserts sólo cortan con `false` explícito, así que
      // no hace falta enumerar cada interruptor nuevo en este doble.
      return { get: async () => ({}) }
    }
    return platformSettingsRepository ?? createSupabasePlatformSettingsRepository(client())
  }
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
  const registrationWriteGuard = requirePermission('admin.registrations.write', { prisma })
  const membershipDeleteGuard = requirePermission('admin.memberships.delete', { prisma })
  const registrationDeleteGuard = requirePermission('admin.registrations.delete', { prisma })
  const accountGuard = requirePermission('admin.athletes.write', { prisma })
  const athleteDeleteGuard = requirePermission('admin.athletes.delete', { prisma })
  // Mismo formato que usa el check-in (`server/routes/tickets.js`): el actor
  // queda identificable en `domain_audit_logs` sin depender de que el id de
  // usuario siga existiendo cuando se lea la auditoría.
  const actorLabel = (req) => `${req.auth.user.id}:${req.auth.user.email}`
  const mailer = brevo ?? createBrevoAdapter({ env })
  const appUrl = (resolveDeploymentAppUrl(env) || env.VITE_APP_URL || '').replace(/\/$/, '')

  function auditClient() {
    try {
      return client()
    } catch {
      return null
    }
  }

  function recordFailedLogin(req, email) {
    return recordOperationalAuditEvent(auditClient(), {
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

  /**
   * Alta fallida. El trigger de `athletes` ya asienta las altas exitosas, pero
   * un alta que no llega a completarse (documento duplicado, base caida) no
   * dejaba nada: la unica evidencia de que alguien intento afiliarse y no pudo
   * era el reclamo del atleta.
   */
  function recordFailedRegistration(req, { email, documentId, error }) {
    const diagnosis = diagnosePaymentFailure(error)
    logger.warn('identity.registration_failed', {
      requestId: req.requestId,
      reason: error?.details?.code ?? error?.status ?? null,
      err: error,
    })
    return recordOperationalAuditEvent(auditClient(), {
      source: 'identity',
      action: 'account.registration_failed',
      entityType: 'athlete',
      entityId: anonymousIdentityId('email', email),
      actorType: 'anonymous',
      status: 'failed',
      severity: error?.status >= 500 ? 'danger' : 'warning',
      metadata: requestAuditMetadata(req, {
        reason: error?.details?.code ?? 'unexpected_error',
        status: error?.status ?? 500,
        message: error?.message ?? String(error),
        documentFingerprint: documentId ? anonymousIdentityId('document', documentId) : null,
        diagnosis: { code: diagnosis.code, fix: diagnosis.fix },
        stack: typeof error?.stack === 'string' ? error.stack.slice(0, 4_000) : null,
      }),
    })
  }

  /**
   * Alta de una orden de cobro (afiliacion, inscripcion o combo). Es el
   * eslabon anterior al checkout: sin este asiento, una orden que se creaba y
   * nunca llegaba a pagarse no se distinguia de una que jamas se creo.
   */
  function paymentTrail() {
    return createPaymentAuditTrail({ client: auditClient() })
  }

  async function recordOrderCreated(req, { concept, result, planCode = null, eventSlug = null }) {
    const order = result?.paymentOrder ?? result?.order ?? result
    const orderId = order?.id ?? order?.paymentId ?? null
    if (!orderId) return false
    return paymentTrail().record({
      action: PAYMENT_TRAIL_ACTIONS.orderCreated,
      entityType: 'athlete_payment_order',
      entityId: orderId,
      status: order?.status ?? 'pendiente',
      metadata: {
        concept,
        planCode,
        eventSlug,
        method: order?.method ?? null,
        amount: order?.amount ?? null,
        currency: order?.currency ?? null,
      },
    })
  }

  async function recordOrderFailure(req, { concept, error, planCode = null, eventSlug = null }) {
    return paymentTrail().recordFailure({
      stage: `order_create:${concept}`,
      entityType: 'athlete_payment_order',
      entityId: `pending:${concept}`,
      error,
      metadata: { concept, planCode, eventSlug },
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
   *
   * Devuelve el status del dispatcher (`sent`, `skipped`, `failed`, …) para
   * que el reenvío de verificación no mienta un ok cuando no salió nada.
   */
  async function sendBestEffort(type, input) {
    try {
      return await mailDispatcher().send(type, input)
    } catch (error) {
      console.warn(`[email:${type}] no se pudo enviar`, error?.message ?? error)
      return { status: 'failed', created: false, emailLog: error?.emailLog ?? null }
    }
  }

  function emailWasSent(result) {
    return result?.status === 'sent'
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

    // No enviar nunca un OTP que la base no pudo persistir: el atleta lo
    // recibiría pero no habría forma de validarlo. El caller lo trata como
    // best-effort y permite reintentar el envío cuando se recupere la DB.
    await repo().storeEmailOtp(row.id, codeHash, otpExpiresAt)

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
        verificationUrl: buildEmailVerificationUrl(appUrl, token),
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

  /**
   * La inscripción no puede depender de que la UI haya mostrado el aviso: el
   * mismo requisito se verifica para API, reintentos e idempotencia. Los datos
   * de emergencia siguen siendo voluntarios para adultos; se piden y se
   * recuerdan en el perfil, pero no bloquean una inscripción válida.
   */
  async function assertCompetitionProfileComplete(profile) {
    const labels = {
      full_name: 'nombre y apellido',
      birth_date: 'fecha de nacimiento',
      sex: 'sexo competitivo',
      gym: 'equipo o gimnasio',
      phone: 'teléfono',
      country: 'país',
      province: 'provincia',
    }
    const missing = Object.entries(labels)
      .filter(([field]) => !String(profile?.[field] ?? '').trim())
      .map(([, label]) => label)

    if (missing.length) {
      throw new HttpError(
        422,
        `Completá tu perfil antes de inscribirte: falta ${missing.join(', ')}.`,
        { code: 'ATHLETE_PROFILE_INCOMPLETE', missing: Object.keys(labels).filter((field) => !String(profile?.[field] ?? '').trim()) },
      )
    }
  }

  async function recordRegistrationAccessUse(gate, { athleteId, orderId, concept }) {
    if (!gate) return
    await accessRepo().recordUse({ gate, athleteId, orderId, concept })
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
        const conflict = athleteExistsError(availability)
        await recordFailedRegistration(req, {
          email: form.email,
          documentId: form.documentId,
          error: conflict,
        })
        throw conflict
      }
      const row = await repo().register(form, await hashPassword(password))
      const session = await createAthleteSession({ client: client(), athleteId: row.id, req })
      res.cookie(ATHLETE_SESSION_COOKIE_NAME, session.token, getAthleteSessionCookieOptions(env))
      // La operación de negocio ya quedó confirmada. El dispatcher reserva el
      // outbox antes de llamar a Brevo; esperar este best-effort garantiza que
      // el email crítico quede enviado o programado para reintento antes de que
      // una función serverless pueda finalizar después de responder.
      const delivery = await sendOnboardingEmails(row).catch((error) => {
        logger.warn('identity.onboarding_email_failed', { athleteId: row.id, err: error })
        return { status: 'failed' }
      })
      logger.info('identity.account_created', {
        athleteId: row.id,
        emailVerificationSent: emailWasSent(delivery),
      })
      res.status(201).json({
        athlete: row,
        emailVerification: { sent: emailWasSent(delivery) },
      })
    } catch (error) {
      // Carrera entre dos altas: el unique sigue siendo PLU07. Traducimos a
      // ATHLETE_EXISTS genérico para que el front muestre el mismo copy.
      if (error instanceof HttpError && error.details?.code === 'PLU07') {
        const conflict = new HttpError(409, 'Ya existe una cuenta con ese correo o documento.', {
          code: 'ATHLETE_EXISTS',
          fields: { email: 'taken', documentId: 'taken' },
        })
        await recordFailedRegistration(req, {
          email: req.validatedBody?.email,
          documentId: req.validatedBody?.documentId,
          error: conflict,
        })
        next(conflict)
        return
      }
      // El asiento del conflicto pre-chequeado ya salio arriba; este cubre
      // todo lo demas (base caida, sesion no emitida, hash fallido).
      if (!(error instanceof HttpError && error.details?.code === 'ATHLETE_EXISTS')) {
        await recordFailedRegistration(req, {
          email: req.validatedBody?.email,
          documentId: req.validatedBody?.documentId,
          error,
        })
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
      const delivery = await sendVerificationEmail(contact)
      if (!emailWasSent(delivery)) {
        throw new HttpError(503, 'No pudimos enviar el correo. Intentá de nuevo en un momento.', {
          code: 'EMAIL_NOT_SENT',
        })
      }
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
          .regex(/^\d{8}$/, 'Ingresá el código de 8 dígitos del correo.'),
      }),
    ),
    async (req, res, next) => {
      try {
        const auth = await athlete(req)
        const code = normalizeEmailVerificationOtp(req.validatedBody.code)
        if (!code) {
          throw new HttpError(400, 'Ingresá el código de 8 dígitos del correo.')
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
  router.post('/login', athleteAuthLimiter, passwordHashShedder, validateBody(loginSchema), async (req, res, next) => {
    try {
      // Mismo esquema que el login de staff: el bloqueo por cuenta se consulta
      // antes del bcrypt. Acá pesa incluso más, porque el padrón es mucho más
      // grande que el puñado de cuentas operativas y una lista de credenciales
      // filtradas tiene muchas más casillas para probar.
      const identity = {
        scope: IDENTITY_SCOPES.athleteLogin,
        identity: req.validatedBody.email,
        deps: { supabaseAdmin: client() },
        env,
      }
      await assertIdentityNotLocked(identity)

      const row = await repo().findLogin(req.validatedBody.email)
      // Igual que en el login de staff: bcrypt corre siempre, exista o no la
      // cuenta, para que el tiempo de respuesta no enumere el padrón.
      const passwordMatches = await verifyPassword(req.validatedBody.password, row?.password_hash)

      if (!row || row.status === 'bloqueado' || !passwordMatches) {
        await registerIdentityFailure(identity)
        await recordFailedLogin(req, req.validatedBody.email)
        throw new HttpError(401, 'Credenciales invalidas.')
      }
      await clearIdentityFailures(identity)
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
        const resetUrl = buildPasswordResetUrl(appUrl, token)
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
  router.get('/me/registration-access-requirements', athleteWriteLimiter, async (req, res, next) => {
    try {
      await athlete(req)
      const eventSlug = String(req.query?.eventSlug ?? '').trim() || null
      if (eventSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(eventSlug)) {
        throw new HttpError(400, 'El identificador del evento es inválido.')
      }
      const [codeRequirements, toggles] = await Promise.all([
        resolveRegistrationAccessRequirements(accessRepo(), { eventSlug }),
        platformSettingsRepo().get(),
      ])
      const availability = resolvePublicCheckoutAvailability(toggles)
      res.json({
        ...codeRequirements,
        membershipEnabled: availability.membershipEnabled,
        registrationEnabled: availability.registrationEnabled,
        // Sin esto la pantalla ofrecía transferencia/efectivo y recién al
        // enviar el formulario aparecía el 409.
        membershipManualEnabled: availability.membershipManualEnabled,
        registrationManualEnabled: availability.registrationManualEnabled,
      })
    } catch (error) { next(error) }
  })
  router.post(
    '/me/registration-access/verify',
    registrationAccessCodeLimiter,
    validateBody(registrationAccessVerifySchema),
    async (req, res, next) => {
      try {
        await athlete(req)
        const { scope, eventSlug = null, code } = req.validatedBody
        if (scope === 'registration' && !eventSlug) {
          throw new HttpError(400, 'Falta el identificador del evento.')
        }
        // Lanza 403 con REGISTRATION_ACCESS_CODE_INVALID si no coincide, y
        // devuelve null cuando la tanda dejó de estar activa entre que se
        // pintó el modal y se envió el código: sin tanda no hay nada que
        // desbloquear, y el checkout sigue igual de disponible.
        const gate = await assertRegistrationAccessCode(accessRepo(), { scope, eventSlug, code })
        res.json({ valid: true, required: Boolean(gate), scope })
      } catch (error) { next(error) }
    },
  )
  router.post('/me/membership-orders', publicWriteLimiter, validateBody(orderSchema), async (req, res, next) => {
    const planCode = req.validatedBody?.planCode ?? null
    try {
      await assertPaidCheckoutAvailable(env, new Date(), { client: client(), checkoutKind: 'membership' })
      const toggles = await platformSettingsRepo().get()
      assertCheckoutEnabled(toggles)
      assertMembershipCheckoutEnabled(toggles)
      if (isManualPaymentMethod(req.validatedBody.paymentMethod)) {
        assertManualChannelEnabled(toggles, 'membership')
      }
      const auth = await athlete(req)
      await assertEmailVerified(auth.athleteId)
      const plan = await repo().findMembershipPlan(req.validatedBody.planCode)
      if (!plan) throw new HttpError(404, 'Plan de afiliacion no encontrado.')
      if (isRecurringMembershipPlan(plan)) assertRecurringMembershipAvailable(env)
      const accessGate = await assertRegistrationAccessCode(accessRepo(), {
        scope: 'membership',
        code: req.validatedBody.accessCode,
      })
      const created = await repo().createMembershipOrder(auth.athleteId, {
        ...req.validatedBody,
        paymentMethod: storagePaymentMethod(req.validatedBody.paymentMethod),
        planCode: plan.code,
        orderAmount: checkoutPriceFor({ concept: 'membership', paymentMethod: req.validatedBody.paymentMethod }),
        manualPaymentChannel: manualPaymentChannel(req.validatedBody.paymentMethod),
      })
      await recordRegistrationAccessUse(accessGate, {
        athleteId: auth.athleteId,
        orderId: created.order.id,
        concept: 'membership',
      })
      await recordOrderCreated(req, { concept: 'membership', result: created, planCode: plan.code })
      res.status(201).json(created)
    } catch (error) {
      await recordOrderFailure(req, { concept: 'membership', error, planCode })
      next(error)
    }
  })
  router.post('/me/registrations', publicWriteLimiter, validateBody(registrationSchema), async (req, res, next) => {
    const eventSlug = req.validatedBody?.eventSlug ?? null
    try {
      const registrationOpensAt = await resolveScopedRegistrationOpensAt(env, client(), req.validatedBody.eventSlug)
      await assertPaidCheckoutAvailable(env, new Date(), {
        registrationOpensAt,
        skipScheduleLookup: true,
        checkoutKind: 'registration',
      })
      const toggles = await platformSettingsRepo().get()
      assertCheckoutEnabled(toggles)
      assertRegistrationCheckoutEnabled(toggles)
      if (isManualPaymentMethod(req.validatedBody.paymentMethod)) {
        assertManualChannelEnabled(toggles, 'registration')
      }
      const auth = await athlete(req)
      await assertEmailVerified(auth.athleteId)
      await assertCompetitionProfileComplete(await repo().findCompetitionProfile(auth.athleteId))
      const accessGate = await assertRegistrationAccessCode(accessRepo(), {
        scope: 'registration',
        eventSlug,
        code: req.validatedBody.accessCode,
      })
      const created = await repo().createRegistration(auth.athleteId, {
        ...req.validatedBody,
        paymentMethod: storagePaymentMethod(req.validatedBody.paymentMethod),
        orderAmount: checkoutPriceFor({ concept: 'registration', paymentMethod: req.validatedBody.paymentMethod }),
        manualPaymentChannel: manualPaymentChannel(req.validatedBody.paymentMethod),
      })
      await recordRegistrationAccessUse(accessGate, {
        athleteId: auth.athleteId,
        orderId: created.order.id,
        concept: 'registration',
      })
      await recordOrderCreated(req, { concept: 'registration', result: created, eventSlug })
      res.status(201).json(created)
    } catch (error) {
      await recordOrderFailure(req, { concept: 'registration', error, eventSlug })
      next(error)
    }
  })
  router.post(
    '/me/registration-combos',
    publicWriteLimiter,
    validateBody(comboRegistrationSchema),
    async (req, res, next) => {
      const eventSlug = req.validatedBody?.eventSlug ?? null
      try {
        const registrationOpensAt = await resolveScopedRegistrationOpensAt(env, client(), req.validatedBody.eventSlug)
        await assertComboCheckoutAvailable(env, new Date(), {
          registrationOpensAt,
          skipScheduleLookup: true,
          checkoutKind: 'combo',
        })
        // El combo crea afiliación e inscripción juntas: si cualquiera de las
        // dos está cerrada, no hay combo posible.
        const toggles = await platformSettingsRepo().get()
        assertCheckoutEnabled(toggles)
        assertMembershipCheckoutEnabled(toggles)
        assertRegistrationCheckoutEnabled(toggles)
        if (isManualPaymentMethod(req.validatedBody.paymentMethod)) {
          assertManualChannelEnabled(toggles, 'membership')
          assertManualChannelEnabled(toggles, 'registration')
        }
        const auth = await athlete(req)
        await assertEmailVerified(auth.athleteId)
        await assertCompetitionProfileComplete(await repo().findCompetitionProfile(auth.athleteId))
        const membershipAccessGate = await assertRegistrationAccessCode(accessRepo(), {
          scope: 'membership',
          code: req.validatedBody.membershipAccessCode,
        })
        const registrationAccessGate = await assertRegistrationAccessCode(accessRepo(), {
          scope: 'registration',
          eventSlug,
          code: req.validatedBody.registrationAccessCode,
        })
        const created = await repo().createRegistrationCombo(auth.athleteId, {
          ...req.validatedBody,
          paymentMethod: storagePaymentMethod(req.validatedBody.paymentMethod),
          orderAmount: checkoutPriceFor({ concept: 'combo', paymentMethod: req.validatedBody.paymentMethod }),
          manualPaymentChannel: manualPaymentChannel(req.validatedBody.paymentMethod),
        })
        await recordRegistrationAccessUse(membershipAccessGate, {
          athleteId: auth.athleteId,
          orderId: created.order.id,
          concept: 'combo',
        })
        await recordRegistrationAccessUse(registrationAccessGate, {
          athleteId: auth.athleteId,
          orderId: created.order.id,
          concept: 'combo',
        })
        await recordOrderCreated(req, { concept: 'combo', result: created, eventSlug })
        res.status(201).json(created)
      } catch (error) {
        await recordOrderFailure(req, { concept: 'combo', error, eventSlug })
        next(error)
      }
    },
  )
  /**
   * Preview de solo lectura de un código de descuento: valida y calcula sin
   * redimir, para que el checkout muestre "ahorrás $X" antes de confirmar. El
   * monto real que se cobra sale únicamente de la respuesta del POST que crea
   * la orden (membership-orders/registrations) — nunca de este preview.
   */
  router.post('/me/discount-preview', publicWriteLimiter, validateBody(discountPreviewSchema), async (req, res, next) => {
    try {
      const auth = await athlete(req)
      const { code, appliesTo, planCode, eventSlug, paymentMethod } = req.validatedBody
      let baseAmount
      if (appliesTo === 'membership') {
        if (!planCode) throw new HttpError(400, 'Falta el plan de afiliación.')
        const plan = await repo().findMembershipPlan(planCode)
        if (!plan) throw new HttpError(404, 'Plan de afiliación no encontrado.')
        baseAmount = plan.price
      } else {
        if (!eventSlug) throw new HttpError(400, 'Falta el evento.')
        const event = await repo().findEventPricing(eventSlug)
        if (!event) throw new HttpError(404, 'Evento no encontrado.')
        baseAmount = event.price
      }
      // Misma política que usa la creación de la orden: mientras la ventana
      // Pitbull esté abierta el precio real lo fija el canal de pago, no el
      // catálogo. Fuera de esa ventana `checkoutPriceFor` devuelve null y
      // vuelve a mandar el precio de la tabla.
      const checkoutAmount = paymentMethod
        ? checkoutPriceFor({ concept: appliesTo, paymentMethod })
        : null
      if (checkoutAmount != null) baseAmount = checkoutAmount
      const preview = await repo().previewDiscountCode(auth.athleteId, { code, appliesTo, baseAmount })
      res.json({ preview })
    } catch (error) {
      next(error)
    }
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
      const canReadAthletes = hasPermission(req.auth.user, 'admin.athletes.read')
      const canReadMemberships = hasPermission(req.auth.user, 'admin.memberships.read')
      const canReadRegistrations = hasPermission(req.auth.user, 'admin.registrations.read')
      const canReadPayments = hasPermission(req.auth.user, 'admin.payments.read')
      // No leemos segmentos que el rol no puede recibir. Antes se cargaban
      // las cuatro tablas y luego se descartaban del JSON: costaba base y
      // transferencia aun para perfiles de alcance acotado.
      const data = await repo().adminData({
        athletes: canReadAthletes,
        memberships: canReadMemberships,
        registrations: canReadRegistrations,
        paymentOrders: canReadPayments,
      })

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
   * Interruptor de validación: con el concepto congelado desde el panel nadie
   * acredita ni rechaza esa orden, tenga o no `admin.payments.approve`. El corte
   * llega antes de la RPC para que el 409 salga sin haber tocado la orden.
   */
  async function assertOrderValidationEnabled(orderId) {
    const order = await repo().paymentOrderSummary(orderId)
    if (!order) throw new HttpError(404, 'Orden no encontrada.')
    assertConceptValidationEnabled(await platformSettingsRepo().get(), order.concept)
    return order
  }

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
    // Distingue alta de renovación para el copy del mail: un socio nuevo
    // recibe bienvenida, uno que renueva recibe la confirmación habitual.
    const isFirstMembership = result.membership?.id
      ? await repo().isFirstMembership(order.athlete_id, result.membership.id)
      : false

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
        isFirstMembership,
      }),
    })
  }

  /**
   * Rechazo manual: comprobante revisado y descartado (ilegible, monto
   * distinto, titular que no coincide). Deja la orden en `rechazado` —mismo
   * vocabulario terminal que usa el webhook de Mercado Pago— y el socio queda
   * libre para iniciar una orden nueva: `create_membership_order_v2`/combo
   * reutilizan la fila de membership `pendiente_pago` del año, no queda
   * ningún bloqueo residual que lo obligue a esperar.
   */
  async function notifyManualRejection(order, reason) {
    if (!order?.athlete_id) return
    const athlete = await repo().findContact(order.athlete_id)
    if (!athlete?.email) return

    await sendBestEffort('payment_rejected', {
      to: athlete.email,
      toName: athlete.full_name,
      entityType: 'athlete_payment_order',
      entityId: order.id,
      idempotencyKey: `email:payment-rejected:manual:${order.id}:${order.updated_at}`,
      params: {
        name: athlete.full_name,
        amount: order.amount,
        concept: displayPaymentConcept(order.concept),
        reason,
        retryUrl: `${appUrl}/mi-cuenta?section=payments`,
      },
    })
  }

  router.post('/admin/payment-orders/:orderId/reject', ...financeGuard, staffLimiter, validateBody(rejectPaymentSchema), async (req, res, next) => {
    const orderId = z.string().uuid().safeParse(req.params.orderId)
    try {
      if (!orderId.success) throw new HttpError(400, 'Orden inválida.')
      await assertOrderValidationEnabled(orderId.data)
      const result = await repo().rejectPayment(orderId.data, req.validatedBody.reason, actorLabel(req))
      await paymentTrail().record({
        action: PAYMENT_TRAIL_ACTIONS.manualRejection,
        entityType: 'athlete_payment_order',
        entityId: orderId.data,
        status: result?.order?.status ?? 'rechazado',
        severity: 'warning',
        metadata: {
          stage: 'manual_rejection',
          method: result?.order?.method ?? 'manual_link',
          rejectedBy: actorLabel(req),
          reason: req.validatedBody.reason,
        },
      })
      // Best-effort: la orden ya quedó rechazada, un fallo de email no lo revierte.
      await notifyManualRejection(result?.order, req.validatedBody.reason).catch((error) =>
        logger.warn('payment.manual_rejection_email_failed', { orderId: orderId.data, err: error }),
      )
      res.json(result)
    } catch (error) {
      await paymentTrail().recordFailure({
        stage: 'manual_rejection',
        entityType: 'athlete_payment_order',
        entityId: orderId.success ? orderId.data : String(req.params.orderId),
        error,
        metadata: { rejectedBy: req.auth?.user?.email ?? null },
      })
      next(error)
    }
  })
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
    const orderId = z.string().uuid().safeParse(req.params.orderId)
    try {
      if (!orderId.success) throw new HttpError(400, 'Orden inválida.')
      await assertOrderValidationEnabled(orderId.data)
      const result = await repo().approvePayment(orderId.data, actorLabel(req))
      // La aprobacion manual mueve plata igual que Mercado Pago: queda en la
      // misma bitacora, con el operador que la firmo.
      await paymentTrail().record({
        action: PAYMENT_TRAIL_ACTIONS.applied,
        entityType: 'athlete_payment_order',
        entityId: orderId.data,
        status: result?.order?.status ?? 'aprobado',
        severity: 'success',
        metadata: {
          stage: 'manual_approval',
          method: result?.order?.method ?? 'manual_link',
          approvedBy: actorLabel(req),
          amount: result?.order?.amount ?? null,
        },
      })
      // Best-effort: el pago ya quedó acreditado, un fallo de email no lo revierte.
      await notifyManualApproval(result).catch((error) =>
        logger.warn('payment.manual_approval_email_failed', { orderId: orderId.data, err: error }),
      )
      res.json(result)
    } catch (error) {
      await paymentTrail().recordFailure({
        stage: 'manual_approval',
        entityType: 'athlete_payment_order',
        entityId: orderId.success ? orderId.data : String(req.params.orderId),
        error,
        metadata: { approvedBy: req.auth?.user?.email ?? null },
      })
      next(error)
    }
  })
  /**
   * Acreditación manual de una orden que el proveedor dio por perdida. Es la
   * contracara de `/approve`: aquella solo toca transferencias y solo mientras
   * la orden siga abierta, así que cuando Mercado Pago devolvía `rechazado` o
   * `cancelado` con el dinero ya cobrado no había ninguna salida operativa.
   *
   * A diferencia de forzar la afiliación con `/memberships/:id/status`, esto
   * deja el cobro asentado en `athlete_payments`, que es de donde el reporte
   * financiero saca los ingresos. No pasa por `assertOrderValidationEnabled`:
   * ese interruptor apaga la validación de comprobantes del flujo normal, y
   * esta es justamente la vía de excepción para cuando el flujo normal falló.
   */
  router.post('/admin/payment-orders/:orderId/force-settle', ...financeGuard, staffLimiter, validateBody(forceSettlePaymentSchema), async (req, res, next) => {
    const orderId = z.string().uuid().safeParse(req.params.orderId)
    try {
      if (!orderId.success) throw new HttpError(400, 'Orden inválida.')
      const result = await repo().forceSettlePayment(
        orderId.data,
        { reason: req.validatedBody.reason, reference: req.validatedBody.reference ?? null },
        actorLabel(req),
      )
      await paymentTrail().record({
        action: PAYMENT_TRAIL_ACTIONS.forceSettled,
        entityType: 'athlete_payment_order',
        entityId: orderId.data,
        status: result?.order?.status ?? 'aprobado',
        // `warning`, no `success`: acreditar por fuera del proveedor es una
        // excepción y tiene que saltar a la vista en la bitácora.
        severity: 'warning',
        metadata: {
          stage: 'force_settlement',
          method: result?.order?.method ?? null,
          settledBy: actorLabel(req),
          amount: result?.order?.amount ?? null,
          reason: req.validatedBody.reason,
          providerReference: req.validatedBody.reference ?? null,
          duplicate: Boolean(result?.duplicate),
        },
      })
      // Best-effort: el pago ya quedó acreditado, un fallo de email no lo revierte.
      await notifyManualApproval(result).catch((error) =>
        logger.warn('payment.force_settlement_email_failed', { orderId: orderId.data, err: error }),
      )
      res.json(result)
    } catch (error) {
      await paymentTrail().recordFailure({
        stage: 'force_settlement',
        entityType: 'athlete_payment_order',
        entityId: orderId.success ? orderId.data : String(req.params.orderId),
        error,
        metadata: { settledBy: req.auth?.user?.email ?? null },
      })
      next(error)
    }
  })
  /**
   * Corrección manual del estado de una inscripción. Hasta ahora el panel solo
   * podía aprobar el pago asociado o borrar la inscripción entera: no había
   * forma de observar a un atleta, ni de revertir una cancelación equivocada
   * sin perder división, categoría y horario ya asignados.
   */
  router.post('/admin/registrations/:registrationId/status', ...registrationWriteGuard, staffLimiter, validateBody(registrationStatusSchema), async (req, res, next) => {
    try {
      const registrationId = z.string().uuid().safeParse(req.params.registrationId)
      if (!registrationId.success) throw new HttpError(400, 'Inscripción inválida.')
      res.json(await repo().setRegistrationStatus(
        registrationId.data,
        req.validatedBody.status,
        req.validatedBody.reason,
        actorLabel(req),
      ))
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
      // Activar a mano es acreditar sin orden: cae bajo el mismo interruptor de
      // validación que la aprobación de un comprobante. La baja también, para no
      // dejar media pantalla operativa con el concepto congelado.
      assertValidationEnabled(await platformSettingsRepo().get(), 'membership')
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
  router.delete('/admin/memberships/:membershipId', ...membershipDeleteGuard, staffLimiter, async (req, res, next) => {
    try {
      const membershipId = z.string().uuid().safeParse(req.params.membershipId)
      if (!membershipId.success) throw new HttpError(400, 'Afiliación inválida.')
      res.json({ deletedMembership: await repo().deleteMembership(membershipId.data, actorLabel(req)) })
    } catch (error) { next(error) }
  })
  router.delete('/admin/registrations/:registrationId', ...registrationDeleteGuard, staffLimiter, async (req, res, next) => {
    try {
      const registrationId = z.string().uuid().safeParse(req.params.registrationId)
      if (!registrationId.success) throw new HttpError(400, 'Inscripción inválida.')
      res.json({ deletedRegistration: await repo().deleteRegistration(registrationId.data, actorLabel(req)) })
    } catch (error) { next(error) }
  })
  router.post(
    '/admin/registrations/:registrationId/public-visibility',
    ...registrationWriteGuard,
    staffLimiter,
    validateBody(z.object({ publicVisible: z.boolean() })),
    async (req, res, next) => {
      try {
        const registrationId = z.string().uuid().safeParse(req.params.registrationId)
        if (!registrationId.success) throw new HttpError(400, 'Inscripción inválida.')
        res.json({
          registration: await repo().setRegistrationPublicVisibility(
            registrationId.data,
            req.validatedBody.publicVisible,
            actorLabel(req),
          ),
        })
      } catch (error) { next(error) }
    },
  )
  router.post('/admin/:athleteId/credential', ...accountGuard, staffLimiter, validateBody(
    z.object({ password: z.string().min(12).max(72) }),
  ), async (req, res, next) => {
    try {
      const athleteId = z.string().uuid().safeParse(req.params.athleteId)
      if (!athleteId.success) throw new HttpError(400, 'Atleta invalido.')
      await repo().setPassword(athleteId.data, await hashPassword(req.validatedBody.password), actorLabel(req))
      res.status(204).end()
    } catch (error) { next(error) }
  })

  /**
   * Borrado definitivo del atleta y todo lo asociado (afiliaciones,
   * inscripciones, ordenes, sesiones, foto). Exige el permiso granular
   * admin.athletes.delete y no tiene vuelta atrás. La cascada y la auditoría viven en la RPC
   * delete_athlete (20260810230000_athlete_hard_delete.sql).
   */
  router.delete('/admin/:athleteId', ...athleteDeleteGuard, staffLimiter, async (req, res, next) => {
    try {
      const athleteId = z.string().uuid().safeParse(req.params.athleteId)
      if (!athleteId.success) throw new HttpError(400, 'Atleta inválido.')
      const deleted = await repo().deleteAthlete(athleteId.data, actorLabel(req))
      res.json({ deletedAthlete: deleted })
    } catch (error) { next(error) }
  })

  return router
}
