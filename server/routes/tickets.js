import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { hasEventScopeAccess } from '../../src/lib/permissions.js'
import { resolveTicketTypeChannels } from '../../src/lib/ticketTypePaymentChannels.js'
import { lookupTicketAccessDays } from '../../src/lib/buyerTicketDays.js'
import { ticketValidityTiming } from '../../src/lib/ticketValidity.js'
import { resolveTicketRevealLeadMinutes, ticketRevealState } from '../../src/lib/ticketReveal.js'
import { normalizeGateCode } from '../../src/lib/ticketGateCode.js'
import {
  attachStaffBuyerOpenKeys,
  signTicketOpenKey,
  ticketOpenKeyMatches,
} from '../modules/ticketing/ticketOpenLink.js'
import { HttpError } from '../lib/errors.js'
import { isMissingSchemaColumn } from '../lib/supabaseRpc.js'
import {
  assertPaidCheckoutAvailable,
  resolvePaidCheckoutOverride,
} from '../lib/featureAvailability.js'
import { checkinAllowlistCache } from '../lib/checkinAllowlistCache.js'
import { PRIVATE_REVALIDATE_CACHE, PUBLIC_CACHE_SECONDS, publicReadCache } from '../lib/http.js'
import { sendPortraitBinary } from '../lib/portraitBinaryCache.js'
import { resolveEventRegistrationOpensAt } from '../lib/registrationSchedule.js'
import { touchProofAccessed } from '../modules/payments/paymentProofRetention.js'
import { PROOF_BUCKET } from '../lib/supabaseAdmin.js'

// Solo hace falta resolver la fecha del evento cuando el gate va a mirarla:
// en produccion y sin kill switch. Evita una consulta a Supabase de mas en
// dev/tests y cuando PAID_CHECKOUT_ENABLED ya decide.
/**
 * Antes de acreditar, el alcance del operador necesita el evento. La RPC de
 * check-in ya valida pago, vigencia y zona, así que no hace falta el verify
 * completo. Los tests que no tienen esta lectura siguen usando `verify`.
 */
async function loadTicketBeforeCheckIn(repository, qrToken) {
  if (typeof repository.locateTicketForCheckIn === 'function') {
    const located = await repository.locateTicketForCheckIn(qrToken)
    if (!located) throw new HttpError(404, 'Entrada no encontrada.')
    return { ticket: located }
  }
  return repository.verify(qrToken)
}

async function resolveDoorQrToken(repo, raw) {
  const value = String(raw ?? '').trim()
  const gateCode = normalizeGateCode(value)
  if (!gateCode) return value
  const qrToken = await repo().findQrTokenByGateCode(gateCode)
  if (!qrToken) throw new HttpError(404, 'Entrada no encontrada.')
  return qrToken
}

async function resolveScopedRegistrationOpensAt(env, supabase, eventSlug) {
  if (resolvePaidCheckoutOverride(env) !== null) return null
  return resolveEventRegistrationOpensAt(supabase, { eventSlug })
}

/**
 * Cotiza la orden en USD para Wise.
 *
 * El monto sale de los precios cargados en el panel (`ticket_types.wise_price`
 * y el `wisePrice` de cada beneficio) cuando están todos; si falta alguno cae a
 * la conversión por dólar blue sobre el total en pesos, que es lo que hacía
 * antes. La regla vive en `shared/ticketWisePricing.js` porque la pantalla de
 * compra arma el mismo número para mostrarlo antes de pagar.
 */
async function resolveTicketOrderWiseQuote(
  supabase,
  { eventSlug, attendees },
  env,
  eventRow = null,
) {
  if (!supabase) return null

  // El id del evento ya lo trae el perfil de cobro que la ruta leyó un momento
  // antes: repetir ese `select` era un viaje entero para volver a saber lo
  // mismo. Con el id en mano, las reglas y los tipos se piden en paralelo.
  const knownId = eventRow?.id ?? null
  const rulesQuery = knownId
    ? supabase.from('events').select('id,rules').eq('id', knownId).maybeSingle()
    : supabase.from('events').select('id,rules').eq('slug', eventSlug).maybeSingle()

  const typesQuery = knownId ? readActiveTicketTypes(supabase, knownId) : null

  const [eventResult, typesResult] = await Promise.all([
    rulesQuery,
    // Sin id previo no se puede filtrar todavía: queda para después del primer
    // resultado, que es el caso de los dobles de test, no el de producción.
    typesQuery ?? Promise.resolve(null),
  ])

  if (eventResult.error) throw new HttpError(500, 'No se pudo cotizar las entradas para Wise.')
  const event = eventResult.data
  if (!event) throw new HttpError(404, 'Evento no encontrado.')

  const types = typesResult ?? (await readActiveTicketTypes(supabase, event.id))
  if (types.error) throw new HttpError(500, 'No se pudo cotizar las entradas para Wise.')

  try {
    return resolveTicketOrderWisePricing(
      attendees,
      {
        ticketTypes: (types.data ?? []).map((type) => ({
          id: type.id,
          name: type.name,
          price: Number(type.price) || 0,
          wisePrice: type.wise_price,
        })),
        addons: ticketAddonCatalog(event.rules),
      },
      env,
    )
  } catch {
    throw new HttpError(400, 'Tipo de entrada invalido.')
  }
}

function readActiveTicketTypes(supabase, eventId) {
  const run = (columns) =>
    supabase.from('ticket_types').select(columns).eq('event_id', eventId).eq('active', true)

  return run('id,name,price,wise_price').then((result) => {
    if (!result.error || !isMissingSchemaColumn(result.error)) return result
    return run('id,name,price')
  })
}

/**
 * Catálogo de beneficios del evento.
 *
 * `event_ticket_addons_catalog(rules)` es, literalmente, `rules -> 'ticketAddons'`:
 * una función pura sobre un JSON que el servidor ya tiene en la mano. Llamarla
 * gastaba un viaje a la base para que Postgres leyera una clave de un objeto,
 * en el camino crítico de cada compra por Wise. La misma lectura acá no cambia
 * ninguna semántica —se conserva el filtro de habilitados con id— y ahorra el
 * viaje.
 */
function ticketAddonCatalog(rules) {
  const addons = rules?.ticketAddons
  if (!Array.isArray(addons)) return []
  return addons.filter((addon) => addon?.enabled !== false && addon?.id)
}
import { validateBody } from '../lib/validate.js'
import { requirePermission } from '../middleware/auth.js'
import { doorCodeAttempts } from '../lib/doorCodeAttempts.js'
import {
  doorCodeLookupLimiter,
  publicReadLimiter,
  scanTelemetryLimiter,
  staffLimiter,
  ticketMineLimiter,
  ticketOrderLookupLimiter,
  ticketPublicWriteLimiter,
} from '../middleware/rateLimit.js'
import { createSupabaseAthleteRepository } from '../modules/athletes/supabaseAthleteRepository.js'
import { createSupabaseTicketRepository } from '../modules/ticketing/supabaseTicketRepository.js'
import {
  resolveTicketAccount,
  serializeAccountTickets,
} from '../modules/ticketing/accountTickets.js'
import { assertEventAccess } from '../lib/eventScope.js'
import { assertTicketOrderInScope } from '../modules/events/orderEventScope.js'
import { createBrevoAdapter } from '../modules/notifications/brevoAdapter.js'
import { fetchScanTrail } from '../modules/checkin/scanTrail.js'
import { INCIDENT_KINDS, createCheckinIncidentRepository } from '../modules/checkin/incidents.js'
import { createEmailDispatcher } from '../modules/notifications/emailDispatcher.js'
import {
  buildTicketConfirmationDelivery,
  ticketRevealMailSettled,
} from '../modules/notifications/ticketConfirmationMail.js'
import { createSupabaseNotificationRepository } from '../modules/notifications/supabaseNotificationRepository.js'
import { displayPaymentConcept } from '../modules/notifications/paymentNotificationService.js'
import { buildEventPagePath } from '../../src/lib/eventPageRoute.js'
import { resolveDeploymentAppUrl } from '../lib/deploymentEnvironment.js'
import { logger } from '../lib/logger.js'
import { createSupabasePlatformSettingsRepository } from '../modules/settings/supabasePlatformSettingsRepository.js'
import {
  assertCheckoutEnabled,
  assertTicketCheckoutEnabled,
  assertValidationEnabled,
  resolvePublicCheckoutAvailability,
} from '../services/platformFeatureToggleService.js'
import {
  applyEventPaymentChannelOverrides,
  applyEventTicketSalesSwitch,
  applyManualTicketDeadline,
  eventPublicTicketSalesEnabled,
  assertEventPaymentChannelEnabled,
  assertManualTicketDeadline,
  resolveBankTransferDetails,
  resolveCashPaymentDetails,
} from '../modules/payments/eventPaymentProfile.js'
import { applyEventChannelOpens } from '../../src/lib/eventPaymentChannels.js'
import { createSupabasePaymentProfileRepository } from '../modules/payments/supabasePaymentProfileRepository.js'
import { resolveMercadoPagoPublicKeyForProfileId } from '../modules/payments/mercadoPagoProfileRuntime.js'
import { wisePriceFor } from '../modules/pricing/checkoutPricePolicy.js'
import { resolveTicketOrderWisePricing } from '../../shared/ticketWisePricing.js'
import { EVENT_MODULE_DISABLED, isStoredEventModuleOn } from '../../shared/eventModules.js'
import { recordScanEvent, recordScanEvents } from '../modules/checkin/scanEventRecorder.js'

const attendeeSchema = z.object({
  fullName: z.string().trim().min(3),
  dni: z
    .string()
    .trim()
    .regex(/^\d{7,8}$/),
  ticketTypeId: z.string().uuid(),
  addonIds: z.array(z.string().trim().min(1)).optional().default([]),
})
/** Igual que `MAX_TICKETS` en TicketPurchaseSection: una compra, diez personas. */
const MAX_ATTENDEES_PER_ORDER = 10

function assertTicketValidity(verified) {
  const ticket = verified?.ticket ?? verified
  const validFrom = ticket?.valid_from ?? ticket?.validFrom
  const validUntil = ticket?.valid_until ?? ticket?.validUntil
  if (!validFrom || !validUntil) return

  const now = Date.now()
  const from = new Date(validFrom).getTime()
  const until = new Date(validUntil).getTime()
  // Mismos códigos que staff_check_in_ticket (20261124100000): sin esto el
  // pre-chequeo de Node devolvía un 409 sin código y el cliente lo clasificaba
  // adivinando por texto, igual que pasaba con el rechazo de la RPC.
  if (Number.isFinite(from) && now < from) {
    throw new HttpError(409, 'Este QR todavía no está vigente.', { code: 'PLU14' })
  }
  if (Number.isFinite(until) && now >= until) {
    throw new HttpError(409, 'Este QR ya venció.', { code: 'PLU15' })
  }
}

/** Contexto temporal que queda junto al intento de puerta, sin PII ni token. */
function ticketScanValidityMetadata(verified) {
  const ticket = verified?.ticket ?? verified
  const timing = ticketValidityTiming(ticket)
  const validFrom = ticket?.valid_from ?? ticket?.validFrom ?? null
  const validUntil = ticket?.valid_until ?? ticket?.validUntil ?? null
  if (!validFrom || !validUntil || timing.status === 'unknown') return {}

  return {
    validity: {
      status: timing.status,
      validFrom,
      validUntil,
      remainingSeconds:
        timing.remainingMs == null ? null : Math.max(0, Math.ceil(timing.remainingMs / 1_000)),
      expiredForSeconds:
        timing.expiredForMs == null ? null : Math.max(0, Math.floor(timing.expiredForMs / 1_000)),
    },
  }
}

// Mismo mapeo que `checkinRejectionOutcome` en checkinScanService.js
// (src/), del lado del servidor: el código PLU del rechazo es la fuente de
// verdad para clasificar la fila de telemetría, no el texto del mensaje.
const SCAN_OUTCOME_BY_ERROR_CODE = Object.freeze({
  PLU05: 'not_ready',
  PLU06: 'already_used',
  PLU14: 'not_yet_valid',
  PLU15: 'expired',
  PLU16: 'wrong_zone',
})

function scanOutcomeFromError(error) {
  return SCAN_OUTCOME_BY_ERROR_CODE[error?.details?.code] ?? 'invalid'
}

/**
 * Un DNI por persona: el cliente ya lo marca, pero la orden se puede armar
 * sin pasar por el formulario (pública o de mostrador). Dos entradas con el
 * mismo documento emiten dos QR que en la puerta se verifican contra la
 * misma persona, y el segundo rebota.
 */
function assertNoDuplicateDni(data, ctx) {
  const dniRow = new Map()
  data.attendees.forEach((attendee, index) => {
    if (dniRow.has(attendee.dni)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['attendees', index, 'dni'],
        message: `El DNI ${attendee.dni} está repetido en las entradas ${dniRow.get(attendee.dni) + 1} y ${index + 1}. Cada persona entra con su propio QR.`,
      })
      return
    }
    dniRow.set(attendee.dni, index)
  })
}

export const createOrderSchema = z
  .object({
    eventSlug: z.string().trim().min(1),
    attendees: z.array(attendeeSchema).min(1).max(MAX_ATTENDEES_PER_ORDER),
    buyer: z
      .object({
        name: z.string().trim().optional(),
        email: z.string().trim().email().optional(),
        phone: z.string().trim().optional(),
      })
      .optional(),
    provider: z.enum(['mercado_pago', 'manual']).default('mercado_pago'),
    manualPaymentChannel: z.enum(['bank_transfer', 'cash_pitbull', 'wise_transfer']).optional(),
    idempotencyKey: z
      .string()
      .uuid()
      .default(() => randomUUID()),
    accessToken: z.string().trim().min(32).optional(),
  })
  .superRefine(assertNoDuplicateDni)
const accessSchema = z.object({ accessToken: z.string().trim().min(32) })
const rejectOrderSchema = z.object({ reason: z.string().trim().min(3).max(500) })
// Mismo piso que afiliaciones: acreditar transferencia o Wise sin archivo
// exige un motivo. La RPC lo vuelve a chequear. Un POST vacío sigue valiendo
// para efectivo y para órdenes que ya tienen comprobante.
const approveOrderSchema = z.object({
  overrideReason: z.string().trim().min(8).max(500).optional(),
})

const ticketOrderStatusEnum = z.enum([
  'creado',
  'pendiente',
  'aprobado',
  'rechazado',
  'cancelado',
  'reembolsado',
])
const booleanQueryParam = z
  .union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')])
  .optional()
/**
 * Filtros del historial de ventas (`GET /orders`). `statuses` llega como CSV
 * desde el navegador -- misma convención que
 * `GET /api/athletes/admin/payment-orders` -- para no traer más filas de las
 * que el chip activo necesita.
 */
const ticketOrdersQuerySchema = z.object({
  statuses: z
    .union([
      z.array(ticketOrderStatusEnum),
      z
        .string()
        .transform((value) =>
          value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        )
        .pipe(z.array(ticketOrderStatusEnum).min(1).max(6)),
    ])
    .optional(),
  channel: z.enum(['mercado_pago', 'bank_transfer', 'cash_pitbull', 'wise_transfer']).optional(),
  /** Filtro duro por meet: el historial de Finanzas no filtra solo por texto. */
  eventSlug: z.string().trim().min(1).max(120).optional(),
  query: z.string().trim().min(1).max(120).optional(),
  sort: z.enum(['recent', 'aging']).optional().default('recent'),
  limit: z.coerce.number().int().min(1).max(200).optional().default(200),
  withCounts: booleanQueryParam.default(false),
})

/**
 * Venta de mostrador: la carga un operador desde el panel, no el comprador
 * desde el checkout público. Sin `provider` (siempre `manual`) ni
 * `accessToken` (el comprador es anónimo y no tiene pestaña propia; el token
 * lo genera el repositorio igual que en el flujo público). Mismo tope de
 * asistentes que el checkout (`MAX_ATTENDEES_PER_ORDER`): las dos RPC cortan
 * en 10 desde 20261231110000. Wise queda afuera: es cobro del exterior en USD
 * con cotización propia, no una venta de mostrador.
 */
export const createManualOrderSchema = z
  .object({
    eventSlug: z.string().trim().min(1),
    attendees: z.array(attendeeSchema).min(1).max(MAX_ATTENDEES_PER_ORDER),
    buyer: z.object({
      // El comprador de mostrador no tiene cuenta: el mail es la única forma
      // de entregarle el QR, así que acá es obligatorio (a diferencia del
      // checkout público, donde es opcional).
      name: z.string().trim().min(3),
      email: z.string().trim().email(),
      phone: z.string().trim().optional(),
    }),
    manualPaymentChannel: z.enum(['bank_transfer', 'cash_pitbull']),
    idempotencyKey: z
      .string()
      .uuid()
      .default(() => randomUUID()),
  })
  .superRefine(assertNoDuplicateDni)

// Outcomes que puede resolver el navegador para un escaneo (checkinScanService.js
// / useCheckInWorkspace.js). Cerrado a propósito: un dispositivo de puerta no
// puede inventar un outcome nuevo para la telemetría.
const SCAN_TELEMETRY_OUTCOMES = [
  'checked_in',
  'ready',
  'already_used',
  'not_ready',
  'not_found',
  'invalid',
  'wrong_zone',
  'not_yet_valid',
  'expired',
  'no_registration',
]
const MAX_SCAN_TELEMETRY_BATCH = 50

const scanTelemetryAttemptSchema = z.object({
  clientId: z.string().uuid(),
  scannedAt: z.string().trim().min(1),
  kind: z.enum(['ticket', 'registration', 'unknown']).default('unknown'),
  outcome: z.enum(SCAN_TELEMETRY_OUTCOMES),
  qrToken: z.string().trim().max(200).optional(),
  offline: z.boolean().optional().default(false),
})

const reportScanTelemetrySchema = z.object({
  eventSlug: z.string().trim().min(1),
  deviceId: z.string().trim().min(1).max(120),
  attempts: z.array(scanTelemetryAttemptSchema).min(1).max(MAX_SCAN_TELEMETRY_BATCH),
})

const scanTrailSchema = z.object({
  eventSlug: z.string().trim().min(1),
  qrToken: z.string().trim().min(1).max(200),
})

const reportIncidentSchema = z.object({
  eventSlug: z.string().trim().min(1),
  kind: z.enum(INCIDENT_KINDS),
  note: z.string().trim().max(300).optional(),
  qrToken: z.string().trim().min(1).max(200).optional(),
})

const resolveIncidentSchema = z.object({
  resolutionNote: z.string().trim().max(300).optional(),
})

export function createTicketRoutes({
  getPrisma,
  getSupabaseAdmin,
  repository,
  incidentRepository,
  athleteRepository,
  platformSettingsRepository,
  notificationRepository = null,
  env = process.env,
  brevo,
}) {
  const router = Router()
  const repo = () => repository ?? createSupabaseTicketRepository(getSupabaseAdmin?.())
  const athleteRepo = () =>
    athleteRepository ?? createSupabaseAthleteRepository(getSupabaseAdmin?.())
  const incidentRepo = () =>
    incidentRepository ?? createCheckinIncidentRepository(getSupabaseAdmin?.())
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
  // El informe de errores de escaneo es lectura de auditoría, no operación de
  // puerta: `admin.audit.read` deja afuera al preset seguridad_plu_arg
  // (sólo admin.events.read + admin.checkin.execute) a propósito -- quien
  // escanea en el puesto no necesita ver el panel de detección del evento.
  // Nota: `assertEventSlugScope` (más abajo) reusa `hasEventScopeAccess`, que
  // hoy exige `admin.checkin.execute` para CUALQUIER cuenta con eventId/
  // eventSlug asignado -- una cuenta acotada a un evento necesita ambos
  // permisos para leer este informe. Ninguna cuenta acotada tiene hoy
  // `admin.audit.read` (ver permissions.js), así que en la práctica esto es
  // "admin global"; se documenta para no sorprender el día que exista una.
  const scanAuditGuard = requirePermission('admin.audit.read', { prisma })
  const financeReadGuard = requirePermission('admin.payments.read', { prisma })
  const financeWriteGuard = requirePermission('admin.payments.approve', { prisma })
  // Variantes que un organizador (rol por evento) SÍ puede usar: antes de actuar sobre
  // una orden se verifica que sea de un evento asignado (`assertTicketOrderInScope`).
  const scopedFinanceReadGuard = requirePermission(
    'admin.payments.read',
    { prisma },
    { eventScoped: true },
  )
  const scopedFinanceWriteGuard = requirePermission(
    'admin.payments.approve',
    { prisma },
    { eventScoped: true },
  )
  const ticketAccessOverrideGuard = requirePermission('admin.events.write', { prisma })
  // "Vendidas" del panel de evento: la lista pide `admin.checkin.execute` (operar la
  // puerta), que un organizador no tiene; para él alcanza con poder ver cobros.
  const scopedTicketsViewGuard = requirePermission('admin.checkin.execute', { prisma }, {
    eventScoped: true,
    scopedPermissions: ['admin.payments.read'],
  })
  const scopedTicketAccessOverrideGuard = requirePermission(
    'admin.events.write',
    { prisma },
    { eventScoped: true },
  )
  const actor = (req) => `${req.auth.user.id}:${req.auth.user.email}`
  const mailer = brevo ?? createBrevoAdapter({ env })
  const appUrl = (resolveDeploymentAppUrl(env) || env.VITE_APP_URL || '').replace(/\/$/, '')

  // Espejo del dispatcher de athletes.js: sin Supabase queda en modo
  // degradado (envía sin log) en vez de romper el armado de la app.
  function mailDispatcher() {
    if (typeof notificationRepository?.beginEmail === 'function') {
      return createEmailDispatcher({ repository: notificationRepository, brevo: mailer, env })
    }
    let repositoryForMail = null
    try {
      const supabase = getSupabaseAdmin?.()
      if (supabase) repositoryForMail = createSupabaseNotificationRepository(supabase)
    } catch {
      repositoryForMail = null
    }
    return createEmailDispatcher({ repository: repositoryForMail, brevo: mailer, env })
  }

  async function sendBestEffort(type, input) {
    try {
      return await mailDispatcher().send(type, input)
    } catch (error) {
      logger.warn(`email.${type}_failed`, { err: error })
      return { status: 'failed', created: false, emailLog: error?.emailLog ?? null }
    }
  }
  /**
   * "Tu entrada ya está paga". Se manda una sola vez por acreditación: la clave
   * de idempotencia lleva el `updated_at` de la orden, así que reaprobar una
   * orden ya aprobada (la RPC devuelve `duplicate`) no reenvía nada.
   *
   * El link abre la entrada con una clave firmada (`?ref=&k=`). Sin esa clave,
   * `TicketOrderLookup` pide el mail del comprador como segundo factor.
   */
  async function markPassRevealed(orderId) {
    const client = getSupabaseAdmin?.()
    if (!client || !orderId) return
    const result = await client
      .from('ticket_orders')
      .update({ pass_revealed_at: new Date().toISOString() })
      .eq('id', orderId)
      .is('pass_revealed_at', null)
    if (result?.error && !isMissingSchemaColumn(result.error)) {
      logger.warn('ticket.pass_reveal_mark_failed', { err: result.error, orderId })
    }
  }

  async function sendTicketConfirmation(result, { resend = false, now = new Date() } = {}) {
    const order = result?.order
    if (!order || (!resend && result?.duplicate)) return null
    if (order.status !== 'aprobado' || !order.buyer_email) return null

    const preset = result?.event ?? order.event ?? null
    const summary = order.event_id
      ? await athleteRepo()
          .findEventSummary(order.event_id)
          .catch(() => null)
      : null
    const event = {
      ...(summary ?? {}),
      ...(preset ?? {}),
      ticket_reveal_lead_minutes:
        preset?.ticket_reveal_lead_minutes ??
        preset?.ticketRevealLeadMinutes ??
        summary?.ticket_reveal_lead_minutes ??
        null,
    }

    const delivery = await buildTicketConfirmationDelivery({
      order,
      tickets: Array.isArray(result.tickets) ? result.tickets : [],
      event,
      appUrl,
      resend,
      now,
      openKey: signTicketOpenKey(order.reference),
    })
    if (!delivery) return null
    const sent = await sendBestEffort('ticket_confirmation', delivery)
    if (delivery.revealComplete && ticketRevealMailSettled(sent)) {
      await markPassRevealed(order.id)
    }
    return sent
  }

  function confirmationMailStatus(result) {
    if (!result) return 'skipped'
    // Un envío que tiró error también llega con `created: false` (el catch de
    // sendBestEffort). Eso no es "ya lo mandamos hoy".
    if (result.status === 'failed') return 'failed'
    if (result.created === false) return 'already'
    if (result.status === 'sent' || result.status === 'skipped') return result.status
    if (result.status === 'suppressed') return 'skipped'
    return 'failed'
  }

  function parseOrderId(req) {
    const parsed = z.string().uuid().safeParse(req.params.orderId)
    if (!parsed.success) throw new HttpError(400, 'Orden invalida.')
    return parsed.data
  }

  /**
   * Perfil de cobro del evento (overrides + banco). Sin Supabase (tests locales
   * con repo mock) se hereda la plataforma: mismo comportamiento que antes de
   * Fase A.
   */
  async function loadEventPaymentProfile(eventSlug) {
    if (!getSupabaseAdmin?.()) return null
    return athleteRepo().findEventPricing(eventSlug)
  }

  /**
   * Los tipos de entrada del carrito tienen que aceptar el canal elegido. Se
   * consulta sólo cuando el repositorio sabe responder: los dobles de test no
   * conocen la tabla y el resto del circuito ya los cubre.
   */
  async function assertTicketTypesAcceptChannel(attendees, channel, eventOverrides) {
    const ids = (attendees ?? []).map((attendee) => attendee?.ticketTypeId).filter(Boolean)
    if (ids.length === 0) return
    const rows = (await repo().findTicketTypePaymentChannels?.(ids)) ?? []
    for (const row of rows) {
      if (row?.payment_channels == null) continue
      const open = resolveTicketTypeChannels({
        eventOverrides,
        typeChannels: row.payment_channels,
      })
      if (!open.includes(channel)) {
        throw new HttpError(409, `La entrada "${row.name}" no se puede pagar con el medio elegido.`)
      }
    }
  }

  const verifiedTicketEventId = (result) => result?.ticket?.event_id ?? result?.event_id

  const ticketAccessOverrideSchema = z
    .object({
      enabled: z.boolean(),
      validFrom: z.string().datetime().nullable().optional(),
      validUntil: z.string().datetime().nullable().optional(),
    })
    .superRefine((value, context) => {
      if (!value.enabled) return
      if (!value.validFrom || !value.validUntil || value.validUntil <= value.validFrom) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'La vigencia individual es inválida.',
        })
      }
    })

  // El alcance vive en la cuenta, no en el nombre del rol. Cualquier usuario
  // con eventId/eventSlug asignado queda limitado a ese evento; los roles
  // globales con admin.checkin.execute pueden operar cualquier evento.
  function assertEventScope(req, targetEventId) {
    // Cuenta por evento (organizador): manda la lista de eventos asignados, no el
    // `eventId` único de las cuentas de puerta.
    if (req.eventScope) return assertEventAccess(req, { eventId: targetEventId })
    if (hasEventScopeAccess(req.auth.user, { eventId: targetEventId })) return
    throw new HttpError(403, 'Esta cuenta no tiene acceso a este evento.')
  }

  function assertEventSlugScope(req, targetEventSlug) {
    if (req.eventScope) return assertEventAccess(req, { slug: targetEventSlug })
    if (hasEventScopeAccess(req.auth.user, { eventSlug: targetEventSlug })) return
    throw new HttpError(403, 'Esta cuenta no tiene acceso a este evento.')
  }

  function ticketAccountFromRequest(req) {
    return resolveTicketAccount({
      req,
      prisma,
      supabase: getSupabaseAdmin?.() ?? null,
    })
  }

  async function rememberBuyerAccount(orderId, account) {
    if (!orderId || !account?.id) return
    const repository = repo()
    if (typeof repository.attachBuyerAccount !== 'function') return
    try {
      await repository.attachBuyerAccount(orderId, account)
    } catch (error) {
      if (isMissingSchemaColumn(error)) return
      logger.warn('ticket.buyer_account_attach_failed', { orderId, err: error })
    }
  }

  router.post(
    '/orders',
    ticketPublicWriteLimiter,
    validateBody(createOrderSchema),
    async (req, res, next) => {
      try {
        const eventSlug = req.validatedBody.eventSlug
        // Agenda, interruptores y perfil del evento no se necesitan entre sí.
        const [registrationOpensAt, toggles, eventPricing] = await Promise.all([
          resolveScopedRegistrationOpensAt(env, getSupabaseAdmin?.(), eventSlug),
          platformSettingsRepo().get(),
          loadEventPaymentProfile(eventSlug),
        ])
        await assertPaidCheckoutAvailable(env, new Date(), {
          registrationOpensAt,
          skipScheduleLookup: true,
          checkoutKind: 'ticket',
        })
        assertCheckoutEnabled(toggles)
        assertTicketCheckoutEnabled(toggles, env)
        // `manual` cubre los tres canales que se acreditan a mano:
        // transferencia, efectivo en el lugar y Wise. Cuál de ellos lo decide el
        // comprador y lo autoriza la matriz plataforma + override del evento.
        const ticketChannel =
          req.validatedBody.provider === 'manual'
            ? (req.validatedBody.manualPaymentChannel ?? 'bank_transfer')
            : 'mercado_pago'
        if (getSupabaseAdmin?.() && !eventPricing) {
          throw new HttpError(404, 'Evento no encontrado.')
        }
        // Mismo corte que `create_ticket_order`: sin el interruptor del evento
        // el público no compra. El mostrador (`POST /orders/manual`) no pasa
        // por acá.
        if (eventPublicTicketSalesEnabled(eventPricing) === false) {
          throw new HttpError(409, 'La venta de entradas esta deshabilitada para este evento.', {
            code: 'PLU03',
          })
        }
        assertEventPaymentChannelEnabled(toggles, 'ticket', ticketChannel, {
          eventOverrides: eventPricing?.payment_channel_overrides ?? null,
        })
        // Módulo «Extras de entradas» apagado: no se venden extras aparte. Los
        // que un tipo trae incluidos no viajan en `addonIds` (el checkout los
        // saca), así que cualquier id acá es un extra comprado.
        if (
          eventPricing &&
          !isStoredEventModuleOn(eventPricing, 'ticketAddons') &&
          req.validatedBody.attendees.some((attendee) => attendee.addonIds?.length > 0)
        ) {
          throw new HttpError(409, 'Este evento no vende extras con las entradas.', {
            code: EVENT_MODULE_DISABLED,
          })
        }
        // Y contra el calendario: una transferencia vendida sobre la fecha no
        // llega a ser un QR antes de que abra la puerta.
        assertManualTicketDeadline(ticketChannel, eventPricing?.starts_at ?? null)
        // El canal del tipo y la cotización Wise leen cosas distintas. Si uno
        // falla, el otro no puede quedar como rechazo suelto.
        const channelCheck = assertTicketTypesAcceptChannel(
          req.validatedBody.attendees,
          ticketChannel,
          eventPricing?.payment_channel_overrides ?? null,
        ).then(
          () => ({ ok: true }),
          (error) => ({ error }),
        )
        const wiseQuote = (
          ticketChannel === 'wise_transfer'
            ? resolveTicketOrderWiseQuote(getSupabaseAdmin?.(), req.validatedBody, env, eventPricing)
            : Promise.resolve(null)
        ).then(
          (value) => ({ value }),
          (error) => ({ error }),
        )
        const [channelResult, wiseResult] = await Promise.all([channelCheck, wiseQuote])
        if (channelResult.error) throw channelResult.error
        if (wiseResult.error) throw wiseResult.error
        const ticketWiseQuote = wiseResult.value
        // `wisePriceFor` sigue siendo el que valida y el que aplica el override
        // de entorno; lo que cambió es de dónde sale el número que recibe. Con
        // precios cargados en el panel entra ya resuelto (`configuredUsd`) y la
        // conversión no se vuelve a usar.
        const ticketWisePrice =
          ticketChannel === 'wise_transfer'
            ? wisePriceFor(
                {
                  concept: 'ticket',
                  arsAmount: ticketWiseQuote?.arsTotal ?? null,
                  configuredUsd:
                    ticketWiseQuote?.source === 'configured' ? ticketWiseQuote.amount : null,
                },
                env,
              )
            : null
        const orderInput = {
          ...req.validatedBody,
          // Precio calculado por la API, nunca por el cliente: el monto
          // por asistente (`wisePriceFor`) se multiplica acá y viaja como
          // total ya cerrado, igual que el resto de las órdenes manuales.
          wiseAmount: ticketWisePrice ? ticketWisePrice.amount : null,
          wiseCurrency: ticketWisePrice?.currency ?? null,
        }
        // La clave pública no depende de que la orden se haya insertado.
        // Si la orden falla, igual se espera la clave para no dejar un rechazo suelto.
        const publicKey = resolveMercadoPagoPublicKeyForProfileId(
          getSupabaseAdmin?.(),
          eventPricing?.mercado_pago_profile_id,
          env,
        ).then(
          (value) => ({ value }),
          (error) => ({ error }),
        )
        // La sesión se lee en paralelo. Si no hay cookie, la orden queda
        // invitada y se recupera como hasta ahora.
        const accountPromise = ticketAccountFromRequest(req).catch((error) => {
          logger.warn('ticket.buyer_account_unresolved', { err: error })
          return null
        })
        let created
        try {
          created = await repo().createOrder(orderInput)
        } catch (error) {
          await Promise.all([publicKey, accountPromise])
          throw error
        }
        const [keyResult, account] = await Promise.all([publicKey, accountPromise])
        if (keyResult.error) throw keyResult.error
        const mercadoPagoPublicKey = keyResult.value
        await rememberBuyerAccount(created?.order?.id ?? null, account)
        res.status(201).json({
          ...created,
          mercadoPagoPublicKey,
          mercadoPagoProfileId: eventPricing?.mercado_pago_profile_id ?? null,
        })
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
          .max(2 * 1024 * 1024),
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
   * Misma forma para el link del mail y para la pestaña que acaba de pagar.
   * Sin acreditar, no viaja el QR: una entrada pendiente no abre la puerta.
   * Snake_case a propósito: `toCamelTicket` espera este shape.
   */
  function serializeBuyerOrder(found, now = new Date()) {
    const paid = found.order.status === 'aprobado'
    const leadMinutes = resolveTicketRevealLeadMinutes(found.order.event)
    return {
      order: {
        reference: found.order.reference,
        status: found.order.status,
        eventTitle: found.order.event?.title ?? null,
        eventSlug: found.order.event?.slug ?? null,
        eventStartsAt: found.order.event?.starts_at ?? null,
        eventVenue: found.order.event?.venue ?? null,
        ticketRevealLeadMinutes: leadMinutes,
      },
      tickets: paid
        ? (found.tickets ?? []).map((ticket) => {
            const reveal = ticketRevealState(ticket, leadMinutes, now)
            return {
              id: ticket.id,
              order_id: ticket.order_id,
              bundle_id: ticket.bundle_id,
              ticket_code: ticket.ticket_code,
              qr_token: reveal.sealed ? null : ticket.qr_token,
              gate_code: reveal.sealed ? null : (ticket.gate_code ?? null),
              pass_sealed: reveal.sealed,
              reveal_at: reveal.revealAt,
              attendee_name: ticket.attendee_name,
              attendee_dni: ticket.attendee_dni ?? null,
              status: ticket.status,
              credential_label: ticket.credential_label,
              credential_scopes: ticket.credential_scopes,
              is_primary_credential: ticket.is_primary_credential !== false,
              addons: Array.isArray(ticket.addons) ? ticket.addons : [],
              valid_from: ticket.valid_from ?? null,
              valid_until: ticket.valid_until ?? null,
              access_days: lookupTicketAccessDays(ticket),
              ticket_type_name: ticket.ticket_types?.name ?? ticket.ticket_type_name ?? null,
            }
          })
        : [],
    }
  }

  /**
   * Entradas de la cuenta. La cookie decide quién mira: el comprador ve la
   * orden completa y el asistente sólo la fila de su documento. Sin sesión
   * no hay listado — el invitado sigue por `/orders/lookup`.
   */
  router.get('/mine', ticketMineLimiter, async (req, res, next) => {
    try {
      const account = await ticketAccountFromRequest(req)
      if (!account?.id) throw new HttpError(401, 'No autenticado.')
      const repository = repo()
      if (typeof repository.listTicketsForAccount !== 'function') {
        throw new HttpError(503, 'No se pudieron leer las entradas de la cuenta.')
      }
      const found = await repository.listTicketsForAccount(account)
      res.json(serializeAccountTickets(found))
    } catch (error) {
      next(error)
    }
  })

  /**
   * Recuperar una compra sin sesión. El mail trae `?ref=&k=` y abre directo.
   * Sin esa clave, la persona tipea el mail como segundo factor.
   */
  router.get('/orders/lookup', ticketOrderLookupLimiter, async (req, res, next) => {
    try {
      const referenceResult = z.string().trim().min(1).max(60).safeParse(req.query.reference)
      if (!referenceResult.success) {
        throw new HttpError(400, 'Referencia o mail invalidos.')
      }
      const reference = referenceResult.data
      const openKey = typeof req.query.k === 'string' ? req.query.k.trim() : ''
      let found = null
      if (openKey) {
        if (!ticketOpenKeyMatches(reference, openKey)) {
          throw new HttpError(404, 'No encontramos una compra con esos datos.')
        }
        found = await repo().findOrderByReference(reference)
      } else {
        const emailResult = z.string().trim().email().safeParse(req.query.email)
        if (!emailResult.success) {
          throw new HttpError(400, 'Referencia o mail invalidos.')
        }
        found = await repo().findOrderByReferenceAndEmail(reference, emailResult.data)
      }
      if (!found) throw new HttpError(404, 'No encontramos una compra con esos datos.')
      res.json(serializeBuyerOrder(found))
    } catch (error) {
      next(error)
    }
  })

  /**
   * La compra en curso ya demostró el token. La pestaña lo consulta mientras
   * espera la acreditación y, cuando cierra, pide el QR real. No comparte el
   * límite de la búsqueda por mail: ese balde es corto a propósito.
   */
  router.get('/orders/:orderId/pass', publicReadLimiter, async (req, res, next) => {
    try {
      const orderIdResult = z.string().uuid().safeParse(req.params.orderId)
      const token = String(req.get('x-order-access-token') ?? '').trim()
      if (!orderIdResult.success) throw new HttpError(400, 'Orden invalida.')
      if (token.length < 32) throw new HttpError(401, 'Falta el token de acceso de la orden.')
      const found = await repo().findOrderForBuyer(orderIdResult.data, token)
      if (!found?.order) throw new HttpError(404, 'Orden no encontrada.')
      res.json(serializeBuyerOrder(found))
    } catch (error) {
      next(error)
    }
  })

  const resendByBuyerSchema = z.object({
    reference: z.string().trim().min(1).max(60),
    email: z.string().trim().email().optional(),
    k: z.string().trim().min(1).max(200).optional(),
  })

  async function resendFoundOrder(found, missingMessage) {
    if (!found?.order) throw new HttpError(404, missingMessage)
    if (found.order.status !== 'aprobado') {
      throw new HttpError(409, 'La entrada todavía no está acreditada.')
    }
    const result = await sendTicketConfirmation(
      {
        order: found.order,
        tickets: found.tickets,
        event: found.event ?? found.order.event ?? null,
        duplicate: false,
      },
      { resend: true },
    )
    return { status: confirmationMailStatus(result) }
  }

  // El comprador ya demostró referencia + mail. No confirma direcciones a ciegas:
  // sin esa pareja la respuesta es la misma que la búsqueda.
  router.post(
    '/orders/resend',
    ticketOrderLookupLimiter,
    validateBody(resendByBuyerSchema),
    async (req, res, next) => {
      try {
        const { reference, email, k } = req.validatedBody
        const found =
          k && ticketOpenKeyMatches(reference, k)
            ? await repo().findOrderForConfirmation({ reference })
            : email
              ? await repo().findOrderForConfirmation({ reference, email })
              : null
        res.json(
          await resendFoundOrder(found, 'No encontramos una compra con esos datos.'),
        )
      } catch (error) {
        next(error)
      }
    },
  )

  router.post(
    '/orders/:orderId/resend',
    ...scopedFinanceWriteGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const orderId = parseOrderId(req)
        await assertTicketOrderInScope(req, getSupabaseAdmin?.(), orderId)
        const found = await repo().findOrderForConfirmation({ orderId })
        res.json(await resendFoundOrder(found, 'Orden no encontrada.'))
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * `checkout` viaja junto a la disponibilidad porque la pantalla de entradas
   * necesita las dos cosas para armarse: cuántos lugares quedan y qué medios de
   * pago están abiertos. Sin esto, la página ofrecía transferencia y el 409
   * recién aparecía al enviar la compra.
   */
  router.get('/availability/:eventSlug', publicReadLimiter, async (req, res, next) => {
    try {
      const eventSlug = String(req.params.eventSlug ?? '').trim()
      const [availability, toggles, eventPricing] = await Promise.all([
        repo().availability(eventSlug),
        platformSettingsRepo().get(),
        loadEventPaymentProfile(eventSlug),
      ])
      const platformAvailability = resolvePublicCheckoutAvailability(
        applyEventChannelOpens(toggles, eventPricing?.payment_channel_overrides),
        env,
      )
      const scoped = applyEventTicketSalesSwitch(
        applyManualTicketDeadline(
          applyEventPaymentChannelOverrides(
            platformAvailability,
            eventPricing?.payment_channel_overrides,
          ),
          eventPricing?.starts_at ?? null,
        ),
        eventPricing,
      )
      // Los dos perfiles de cobro son independientes entre sí: el alias del
      // banco no condiciona la clave pública de Mercado Pago. Encadenarlos
      // sumaba las dos latencias en la respuesta que la pantalla de entradas
      // espera para dibujarse.
      const supabase = getSupabaseAdmin?.()
      const [bankProfile, mercadoPagoPublicKey] = await Promise.all([
        eventPricing?.bank_transfer_profile_id && supabase
          ? createSupabasePaymentProfileRepository(supabase)
              .findById(eventPricing.bank_transfer_profile_id)
              .catch(() => null)
          : null,
        resolveMercadoPagoPublicKeyForProfileId(
          supabase,
          eventPricing?.mercado_pago_profile_id,
          env,
        ),
      ])
      // Ventana corta: el stock que se muestra acá decide una compra. La
      // reserva real se valida igual al crear la orden, así que 10 s de atraso
      // no habilitan una venta de más -- como mucho un 409 al confirmar.
      res.set('Cache-Control', publicReadCache(PUBLIC_CACHE_SECONDS.LIVE))
      res.json({
        availability,
        checkout: {
          ticketEnabled: scoped.ticketEnabled,
          eventTicketsEnabled: scoped.eventTicketsEnabled,
          ticketManualEnabled: scoped.ticketManualEnabled,
          channels: scoped.paymentChannels.ticket,
          bankTransfer: resolveBankTransferDetails(eventPricing, env, bankProfile),
          cashPayment: resolveCashPaymentDetails(eventPricing),
          bankTransferProfileId: eventPricing?.bank_transfer_profile_id ?? null,
          mercadoPagoProfileId: eventPricing?.mercado_pago_profile_id ?? null,
          mercadoPagoPublicKey,
        },
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
  /**
   * Historial de ventas para Finanzas: a diferencia de `/orders/pending-manual`
   * (solo transferencias por validar), trae cualquier estado y cualquier
   * proveedor -- es la vista que responde "cuánto se vendió" de un evento, no
   * solo "qué falta validar". Mismos filtros y forma de respuesta que
   * `GET /api/athletes/admin/payment-orders`.
   */
  router.get('/orders', ...financeReadGuard, staffLimiter, async (req, res, next) => {
    try {
      const parsed = ticketOrdersQuerySchema.safeParse(req.query)
      if (!parsed.success) throw new HttpError(400, 'Filtros de órdenes inválidos.')
      const { withCounts, eventSlug, ...filters } = parsed.data
      let eventId = null
      if (eventSlug) {
        assertEventSlugScope(req, eventSlug)
        eventId = await repo().resolveEventIdBySlug(eventSlug)
        if (!eventId) throw new HttpError(404, 'Evento no encontrado.')
      } else if (req.eventScope) {
        // Cuenta por evento sin slug: no puede listar el historial global.
        throw new HttpError(400, 'Falta eventSlug.')
      }
      // Los contadores solo viajan si se piden: la tabla se relee en cada
      // cambio de chip y los cinco `count` no cambian por eso.
      const listFilters = { ...filters, eventId }
      const [orders, counts] = await Promise.all([
        repo().listOrders(listFilters),
        withCounts ? repo().orderCounts({ eventId }) : Promise.resolve(null),
      ])
      res.json(counts ? { orders, counts } : { orders })
    } catch (error) {
      next(error)
    }
  })
  /**
   * KPIs de ventas de entradas para el tab "Análisis" de Pagos: cuántas se
   * vendieron, recaudado por canal/moneda, cupo restante y tendencia diaria.
   * A diferencia del Libro de caja (`GET /api/finance`, sólo Mercado Pago vía
   * `ticket_payments`), acá entra todo lo manual también -- da distinto a
   * propósito.
   */
  router.get(
    '/sales-summary/:eventSlug',
    ...financeReadGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const eventId = await repo().resolveEventIdBySlug(req.params.eventSlug)
        if (!eventId) throw new HttpError(404, 'Evento no encontrado.')
        const event = await athleteRepo().findEventSummary(eventId)
        const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90)
        const to = new Date()
        const from = new Date(to.getTime() - days * 86_400_000)
        const range = { fromISO: from.toISOString(), toISO: to.toISOString() }
        const [capacity, revenue, daily] = await Promise.all([
          repo().capacitySummary(eventId),
          repo().revenueSummary(eventId, range),
          repo().dailyTicketsSold(eventId, range),
        ])
        res.json({
          event: { slug: event?.slug ?? req.params.eventSlug, title: event?.title ?? null },
          capacity,
          revenue,
          daily,
          rangeDays: days,
        })
      } catch (error) {
        next(error)
      }
    },
  )
  /**
   * Venta de mostrador: un operador carga una venta que se cerró por fuera
   * del checkout público (efectivo en la puerta, transferencia recibida por
   * privado). A diferencia de `POST /orders`, no pasa por
   * `assertPaidCheckoutAvailable` ni `assertManualTicketDeadline` -- son las
   * guardas de agenda pública y el corte de 72 h, justo lo que el mostrador
   * necesita saltear (`create_ticket_order_v3` hace lo mismo con las
   * ventanas de venta online). El resto de las reglas de negocio se
   * mantienen: interruptor maestro de cobros, medios habilitados por evento
   * y por tipo de entrada, cupo y precio de catálogo -- un operador no
   * evade eso, lo hace desde la configuración del evento. El interruptor
   * público `ticketsEnabled` sí se saltea: una venta ya cobrada en la puerta
   * se puede cargar aunque la página no esté vendiendo.
   *
   * Efectivo se auto-aprueba en el mismo request (el operador ya cobró en
   * mano); transferencia queda `pendiente` y sigue el circuito de
   * validación existente (`/orders/pending-manual` + `/approve`).
   */
  router.post(
    '/orders/manual',
    ...financeWriteGuard,
    staffLimiter,
    validateBody(createManualOrderSchema),
    async (req, res, next) => {
      try {
        const toggles = await platformSettingsRepo().get()
        assertCheckoutEnabled(toggles)
        assertTicketCheckoutEnabled(toggles, env)
        const { manualPaymentChannel } = req.validatedBody
        const eventPricing = await loadEventPaymentProfile(req.validatedBody.eventSlug)
        if (getSupabaseAdmin?.() && !eventPricing) {
          throw new HttpError(404, 'Evento no encontrado.')
        }
        assertEventPaymentChannelEnabled(toggles, 'ticket', manualPaymentChannel, {
          eventOverrides: eventPricing?.payment_channel_overrides ?? null,
        })
        await assertTicketTypesAcceptChannel(
          req.validatedBody.attendees,
          manualPaymentChannel,
          eventPricing?.payment_channel_overrides ?? null,
        )
        const created = await repo().createOrder({
          ...req.validatedBody,
          provider: 'manual',
          staffActor: actor(req),
        })
        if (manualPaymentChannel !== 'cash_pitbull') {
          res.status(201).json({ ...created, approved: false })
          return
        }
        assertValidationEnabled(toggles, 'ticket')
        const approveResult = await repo().approve(created.order.id, actor(req))
        await sendTicketConfirmation(approveResult).catch((error) =>
          logger.warn('email.ticket_confirmation_failed', {
            orderId: approveResult?.order?.id,
            err: error,
          }),
        )
        res.status(201).json({ ...approveResult, approved: true })
      } catch (error) {
        next(error)
      }
    },
  )
  router.post(
    '/orders/:orderId/approve',
    ...scopedFinanceWriteGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const approveOrderId = parseOrderId(req)
        await assertTicketOrderInScope(req, getSupabaseAdmin?.(), approveOrderId)
        assertValidationEnabled(await platformSettingsRepo().get(), 'ticket')
        const parsedOverride = approveOrderSchema.safeParse(
          req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {},
        )
        if (!parsedOverride.success) {
          throw new HttpError(400, 'El motivo de override tiene que tener al menos 8 caracteres.')
        }
        const result = await repo().approve(approveOrderId, actor(req), {
          overrideReason: parsedOverride.data.overrideReason ?? null,
        })
        // El comprador es anónimo: no tiene cuenta, y la orden vive en el
        // `sessionStorage` de la pestaña en la que compró. Si la cerró —y entre
        // la transferencia y la acreditación pueden pasar 48 horas, así que la
        // cerró— este mail es la única forma de que se entere de que su entrada
        // ya vale. El rechazo ya avisaba; la aprobación no, que era el lado que
        // más importa.
        await sendTicketConfirmation(result).catch((error) =>
          logger.warn('email.ticket_confirmation_failed', {
            orderId: result?.order?.id,
            err: error,
          }),
        )
        res.json(result)
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
    ...scopedFinanceWriteGuard,
    staffLimiter,
    validateBody(rejectOrderSchema),
    async (req, res, next) => {
      try {
        const orderId = parseOrderId(req)
        await assertTicketOrderInScope(req, getSupabaseAdmin?.(), orderId)
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
    ...scopedFinanceReadGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const proofOrderId = parseOrderId(req)
        await assertTicketOrderInScope(req, getSupabaseAdmin?.(), proofOrderId)
        res.json({ url: await repo().proofUrl(proofOrderId) })
      } catch (error) {
        next(error)
      }
    },
  )

  router.get(
    '/orders/:orderId/proof',
    ...scopedFinanceReadGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const orderId = parseOrderId(req)
        const supabase = getSupabaseAdmin?.()
        if (!supabase) {
          throw new HttpError(503, 'Supabase no está configurado en el servidor.')
        }
        await assertTicketOrderInScope(req, supabase, orderId)

        const path = await repo().proofPath(orderId)
        void touchProofAccessed(supabase, {
          table: 'ticket_orders',
          orderId,
        }).catch(() => {})

        await sendPortraitBinary({
          req,
          res,
          client: supabase,
          path,
          bucket: PROOF_BUCKET,
          cacheControl: 'private, max-age=300, stale-while-revalidate=60',
        })
      } catch (error) {
        next(error)
      }
    },
  )

  router.get('/', ...scopedTicketsViewGuard, staffLimiter, async (req, res, next) => {
    try {
      const eventSlug = String(req.query.eventSlug ?? '')
      if (!eventSlug) throw new HttpError(400, 'Falta eventSlug.')
      assertEventSlugScope(req, eventSlug)
      res.json({ tickets: attachStaffBuyerOpenKeys(await repo().listForEvent(eventSlug)) })
    } catch (error) {
      next(error)
    }
  })

  router.put(
    '/:ticketId/access-override',
    ...scopedTicketAccessOverrideGuard,
    staffLimiter,
    validateBody(ticketAccessOverrideSchema),
    async (req, res, next) => {
      try {
        const ticketId = z.string().uuid().parse(req.params.ticketId)
        const ticket = await repo().resolveTicketById?.(ticketId)
        if (!ticket) throw new HttpError(404, 'Entrada no encontrada.')
        assertEventScope(req, ticket.event_id ?? ticket.eventId)
        const result = await repo().setAccessOverride(ticketId, req.validatedBody, actor(req))
        res.json(result)
      } catch (error) {
        next(error)
      }
    },
  )
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
      const eventSlug = req.params.eventSlug
      assertEventSlugScope(req, eventSlug)
      const ticketRepo = repo()
      const revision =
        typeof ticketRepo.allowlistRevision === 'function'
          ? await ticketRepo.allowlistRevision(eventSlug)
          : null
      const cache = checkinAllowlistCache(eventSlug, revision, req.headers['if-none-match'])
      if (cache.etag) {
        res.set('ETag', cache.etag)
        res.set('Cache-Control', PRIVATE_REVALIDATE_CACHE)
        if (cache.notModified) {
          res.status(304).end()
          return
        }
      }
      res.json(await ticketRepo.allowlist(eventSlug))
    } catch (error) {
      next(error)
    }
  })
  /**
   * Puesto que queda escrito en `check_ins` y en la auditoría. Si la cuenta
   * tiene zona asignada manda el nombre de la zona: un dispositivo no puede
   * declararse en otra puerta. El valor del cuerpo sólo vale para cuentas sin
   * zona (administración), y se sanea: sin caracteres de control y acotado.
   */
  function resolveGateLabel(req) {
    const zoneName = req.auth?.user?.securityZone?.name
    if (zoneName) return zoneName
    const declared = typeof req.body?.gate === 'string' ? req.body.gate : ''
    const cleaned = declared
      .replace(/\p{Cc}/gu, '')
      .trim()
      .slice(0, 80)
    return cleaned || 'Puerta'
  }

  /**
   * Alcance de la zona de quien escanea. Es lo que decide qué credencial abre
   * qué puesto: la de ENTRENADOR entra al calentamiento y la de espectador no.
   * El alcance sale de la cuenta, nunca del cuerpo del request -- si lo mandara
   * el cliente, cualquiera abriría cualquier zona diciendo que está en ella.
   * Sin zona asignada devuelve null y la RPC no valida, que es el
   * comportamiento anterior.
   */
  async function scannerZoneScope(req) {
    const zoneId = req.auth?.user?.securityZoneId
    if (!zoneId) return null
    const zone = await getPrisma().eventSecurityZone.findUnique({
      where: { id: zoneId },
      select: { scope: true },
    })
    return zone?.scope ?? null
  }

  /**
   * Telemetría de escaneos que el navegador resolvió y que nunca llegaron a
   * `POST /checkin/:qrToken` -- el operador vio "vencido" o "zona incorrecta"
   * y nunca tocó Registrar ingreso. El servidor no confía en nada del cuerpo
   * salvo el outcome (enum cerrado) y el token: evento, puerta, zona y actor
   * SIEMPRE se resuelven de la cuenta autenticada, nunca del payload -- si no,
   * cualquier dispositivo podría escribir telemetría de otro evento o
   * atribuírsela a otra puerta. Estas filas quedan `evidence: 'operator'`,
   * nunca `'server'`: son lo que el dispositivo dice haber visto, no lo que
   * la base confirmó.
   *
   * Registrada ANTES de `/checkin/:qrToken`: Express matchea por orden de
   * alta, y `:qrToken` capturaría literalmente "scan-events" como si fuera
   * un token si esta ruta quedara después.
   */
  router.post(
    '/checkin/scan-events',
    ...guard,
    scanTelemetryLimiter,
    validateBody(reportScanTelemetrySchema),
    async (req, res, next) => {
      try {
        const { eventSlug, deviceId, attempts } = req.validatedBody
        assertEventSlugScope(req, eventSlug)
        const eventId = await repo().resolveEventIdBySlug(eventSlug)
        if (!eventId) throw new HttpError(404, 'Evento no encontrado.')

        const gate = req.auth?.user?.securityZone?.name || null
        const zoneScope = await scannerZoneScope(req)
        const actorLabel = actor(req)

        const resolvedTickets = await Promise.all(
          attempts.map((attempt) =>
            attempt.kind === 'ticket' &&
            attempt.outcome !== 'not_found' &&
            attempt.outcome !== 'invalid'
              ? repo().resolveTicketByQrToken(attempt.qrToken)
              : Promise.resolve(null),
          ),
        )

        const rows = attempts.map((attempt, index) => {
          const resolvedTicket = resolvedTickets[index]
          return {
            eventId,
            outcome: attempt.outcome,
            kind: attempt.kind,
            evidence: 'operator',
            ticketId: resolvedTicket?.event_id === eventId ? resolvedTicket.id : null,
            qrToken: attempt.kind === 'ticket' ? attempt.qrToken : null,
            gate,
            zoneScope,
            actorLabel,
            deviceId,
            clientId: attempt.clientId,
            offline: attempt.offline,
            scannedAt: attempt.scannedAt,
            metadata:
              resolvedTicket?.event_id === eventId
                ? ticketScanValidityMetadata(resolvedTicket)
                : {},
          }
        })

        await recordScanEvents(getSupabaseAdmin?.(), rows)
        res.status(202).json({ accepted: rows.length })
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * Historial de UN QR para quien lo tiene delante: si ya ingresó, cuándo y por
   * qué puerta, y cuántos intentos hubo después. Es lo que distingue un error de
   * una copia. POST y no GET porque el token es una credencial al portador y no
   * debe quedar en la URL de los logs.
   *
   * No devuelve actor, dispositivo ni DNI (ver `summarizeScanTrail`). Registrada
   * antes de `/checkin/:qrToken`: Express matchea por orden de alta y
   * `:qrToken` capturaría literalmente "trail".
   */
  router.post(
    '/checkin/trail',
    ...guard,
    staffLimiter,
    validateBody(scanTrailSchema),
    async (req, res, next) => {
      try {
        const { eventSlug, qrToken } = req.validatedBody
        assertEventSlugScope(req, eventSlug)
        const eventId = await repo().resolveEventIdBySlug(eventSlug)
        if (!eventId) throw new HttpError(404, 'Evento no encontrado.')
        res.set('Cache-Control', 'private, no-store')
        res.json({ trail: await fetchScanTrail(getSupabaseAdmin?.(), { eventId, qrToken }) })
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * Parte de incidente cargado desde el puesto. Evento, puesto y autor salen de
   * la cuenta autenticada, nunca del cuerpo.
   */
  router.post(
    '/checkin/incidents',
    ...guard,
    staffLimiter,
    validateBody(reportIncidentSchema),
    async (req, res, next) => {
      try {
        const { eventSlug, kind, note, qrToken } = req.validatedBody
        assertEventSlugScope(req, eventSlug)
        const eventId = await repo().resolveEventIdBySlug(eventSlug)
        if (!eventId) throw new HttpError(404, 'Evento no encontrado.')

        // El ticket se referencia por FK sólo si pertenece a este evento: un
        // token de otro evento no puede colgar un parte acá.
        const resolvedTicket = qrToken ? await repo().resolveTicketByQrToken(qrToken) : null
        const ticketId = resolvedTicket?.event_id === eventId ? resolvedTicket.id : null

        const incident = await incidentRepo().report({
          eventId,
          kind,
          note,
          qrToken,
          ticketId,
          gate: req.auth?.user?.securityZone?.name || null,
          zoneScope: await scannerZoneScope(req),
          reportedBy: actor(req),
        })
        res.status(201).json({ incident })
      } catch (error) {
        next(error)
      }
    },
  )

  router.get(
    '/checkin/incidents/:eventSlug',
    ...scanAuditGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        assertEventSlugScope(req, req.params.eventSlug)
        const status = ['open', 'resolved'].includes(req.query.status)
          ? String(req.query.status)
          : null
        const eventId = await repo().resolveEventIdBySlug(req.params.eventSlug)
        if (!eventId) throw new HttpError(404, 'Evento no encontrado.')
        res.set('Cache-Control', 'private, no-store')
        res.json({ incidents: await incidentRepo().listForEvent(eventId, { status }) })
      } catch (error) {
        next(error)
      }
    },
  )

  router.post(
    '/checkin/incidents/:eventSlug/:incidentId/resolve',
    ...ticketAccessOverrideGuard,
    staffLimiter,
    validateBody(resolveIncidentSchema),
    async (req, res, next) => {
      try {
        assertEventSlugScope(req, req.params.eventSlug)
        const parsedId = z.string().uuid().safeParse(req.params.incidentId)
        if (!parsedId.success) throw new HttpError(400, 'Incidente inválido.')
        const incidentId = parsedId.data
        const eventId = await repo().resolveEventIdBySlug(req.params.eventSlug)
        if (!eventId) throw new HttpError(404, 'Evento no encontrado.')
        const incident = await incidentRepo().resolve(eventId, incidentId, {
          resolvedBy: actor(req),
          resolutionNote: req.validatedBody.resolutionNote,
        })
        res.json({ incident })
      } catch (error) {
        next(error)
      }
    },
  )

  const doorCodeBodySchema = z.object({
    code: z.string().trim().min(1).max(80),
  })

  async function answerDoorCode(req, res, rawCode) {
    const gateCode = normalizeGateCode(rawCode)
    if (!gateCode) throw new HttpError(400, 'Código de puerta inválido.')
    const accountKey = req.auth?.user?.id ? String(req.auth.user.id) : ''
    const attempt = doorCodeAttempts.check(accountKey)
    if (!attempt.ok) {
      throw new HttpError(429, 'Demasiados códigos incorrectos. Esperá un momento y reintentá.')
    }
    const qrToken = await repo().findQrTokenByGateCode(gateCode)
    doorCodeAttempts.record(accountKey, Boolean(qrToken))
    if (!qrToken) {
      logger.info('checkin.door_code_miss', { userId: accountKey || null })
      throw new HttpError(404, 'Entrada no encontrada.')
    }
    res.json({ qrToken })
  }

  // El código va en el cuerpo: la URL queda en logs, historial y proxies.
  router.post(
    '/door-code',
    ...guard,
    doorCodeLookupLimiter,
    validateBody(doorCodeBodySchema),
    async (req, res, next) => {
      try {
        await answerDoorCode(req, res, req.validatedBody.code)
      } catch (error) {
        next(error)
      }
    },
  )

  router.get('/door-code/:code', ...guard, doorCodeLookupLimiter, async (req, res, next) => {
    try {
      await answerDoorCode(req, res, req.params.code)
    } catch (error) {
      next(error)
    }
  })

  const previewBodySchema = z.object({
    code: z.string().trim().min(1).max(500),
  })

  /**
   * Vista previa de puerta en un solo viaje: token opaco o código dictado.
   * No acredita el ingreso. El código de puerta no se resuelve en el verify
   * público, para que no se pueda enumerar desde afuera.
   */
  async function previewTicket(req, rawCode) {
    const gateCode = normalizeGateCode(rawCode)
    const accountKey = req.auth?.user?.id ? String(req.auth.user.id) : ''
    if (gateCode) {
      const attempt = doorCodeAttempts.check(accountKey)
      if (!attempt.ok) {
        throw new HttpError(429, 'Demasiados códigos incorrectos. Esperá un momento y reintentá.')
      }
    }
    let qrToken
    try {
      qrToken = await resolveDoorQrToken(repo, rawCode)
      if (gateCode) doorCodeAttempts.record(accountKey, true)
    } catch (error) {
      if (gateCode) doorCodeAttempts.record(accountKey, false)
      throw error
    }
    const ticket = await repo().verify(qrToken)
    assertEventScope(req, verifiedTicketEventId(ticket))
    return ticket
  }

  router.post(
    '/checkin/preview',
    ...guard,
    staffLimiter,
    validateBody(previewBodySchema),
    async (req, res, next) => {
      try {
        res.json({ ticket: await previewTicket(req, req.validatedBody.code) })
      } catch (error) {
        next(error)
      }
    },
  )

  router.post('/checkin/:qrToken', ...guard, staffLimiter, async (req, res, next) => {
    let ticket
    let qrToken = req.params.qrToken
    const gate = resolveGateLabel(req)
    const zoneScopeResult = scannerZoneScope(req).then(
      (scope) => ({ scope }),
      (error) => ({ error }),
    )
    try {
      qrToken = await resolveDoorQrToken(repo, req.params.qrToken)
      ticket = await loadTicketBeforeCheckIn(repo(), qrToken)
      const eventId = verifiedTicketEventId(ticket)
      assertEventScope(req, eventId)
      assertTicketValidity(ticket)
      const zone = await zoneScopeResult
      if (zone.error) throw zone.error
      const zoneScope = zone.scope
      const result = await repo().checkIn(qrToken, gate, actor(req), zoneScope)
      // Autoritativo: el servidor observó el ingreso. No bloquea la
      // respuesta -- un rastro de puerta perdido no puede volver a fallar
      // un check-in que ya se acreditó.
      void recordScanEvent(getSupabaseAdmin?.(), {
        eventId,
        outcome: 'checked_in',
        kind: 'ticket',
        evidence: 'server',
        ticketId: ticket?.ticket?.id ?? null,
        qrToken,
        gate,
        zoneScope,
        actorLabel: actor(req),
        metadata: ticketScanValidityMetadata(ticket),
      })
      res.json(result)
    } catch (error) {
      // Un token que no resolvió a ninguna entrada no tiene event_id que
      // atribuirle acá (la tabla es por evento): ese caso lo cubre el
      // reporte del dispositivo (`evidence: 'operator'`), que sí conoce el
      // evento en el que está parado aunque el token no exista.
      const eventId = verifiedTicketEventId(ticket)
      if (eventId) {
        void recordScanEvent(getSupabaseAdmin?.(), {
          eventId,
          outcome: scanOutcomeFromError(error),
          kind: 'ticket',
          evidence: 'server',
          ticketId: ticket?.ticket?.id ?? null,
          qrToken,
          gate,
          actorLabel: actor(req),
          errorCode: error?.details?.code ?? null,
          metadata: ticketScanValidityMetadata(ticket),
        })
      }
      next(error)
    }
  })
  router.post(
    '/checkin/:qrToken/addons/:addonId/redeem',
    ...guard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const ticket = await loadTicketBeforeCheckIn(repo(), req.params.qrToken)
        assertEventScope(req, verifiedTicketEventId(ticket))
        assertTicketValidity(ticket)
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
            resolveGateLabel(req),
            actor(req),
          ),
        )
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * Informe de errores de escaneo para el panel de detección del evento.
   * Guardado por `admin.audit.read`, no `admin.checkin.execute`: es análisis
   * para quien administra el evento, no una operación de puerta.
   */
  router.get(
    '/checkin/scan-report/:eventSlug',
    ...scanAuditGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        assertEventSlugScope(req, req.params.eventSlug)
        const { from, until, limit } = req.query
        res.json(
          await repo().scanReport(req.params.eventSlug, {
            from: from ? String(from) : null,
            until: until ? String(until) : null,
            limit: limit ? Number(limit) : null,
          }),
        )
      } catch (error) {
        next(error)
      }
    },
  )

  return router
}
