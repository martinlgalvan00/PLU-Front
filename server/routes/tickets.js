import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { hasEventScopeAccess } from '../../src/lib/permissions.js'
import { resolveTicketTypeChannels } from '../../src/lib/ticketTypePaymentChannels.js'
import { ticketValidityTiming } from '../../src/lib/ticketValidity.js'
import { HttpError } from '../lib/errors.js'
import { isMissingSchemaColumn } from '../lib/supabaseRpc.js'
import {
  assertPaidCheckoutAvailable,
  resolvePaidCheckoutOverride,
} from '../lib/featureAvailability.js'
import { PUBLIC_CACHE_SECONDS, publicReadCache } from '../lib/http.js'
import { sendPortraitBinary } from '../lib/portraitBinaryCache.js'
import { resolveEventRegistrationOpensAt } from '../lib/registrationSchedule.js'
import { touchProofAccessed } from '../modules/payments/paymentProofRetention.js'
import { PROOF_BUCKET } from '../lib/supabaseAdmin.js'

// Solo hace falta resolver la fecha del evento cuando el gate va a mirarla:
// en produccion y sin kill switch. Evita una consulta a Supabase de mas en
// dev/tests y cuando PAID_CHECKOUT_ENABLED ya decide.
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
import {
  publicReadLimiter,
  scanTelemetryLimiter,
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
  assertTicketCheckoutEnabled,
  assertValidationEnabled,
  resolvePublicCheckoutAvailability,
} from '../services/platformFeatureToggleService.js'
import {
  applyEventPaymentChannelOverrides,
  applyManualTicketDeadline,
  assertEventPaymentChannelEnabled,
  assertManualTicketDeadline,
  resolveBankTransferDetails,
} from '../modules/payments/eventPaymentProfile.js'
import { createSupabasePaymentProfileRepository } from '../modules/payments/supabasePaymentProfileRepository.js'
import { resolveMercadoPagoPublicKeyForProfileId } from '../modules/payments/mercadoPagoProfileRuntime.js'
import { wisePriceFor } from '../modules/pricing/checkoutPricePolicy.js'
import { resolveTicketOrderWisePricing } from '../../shared/ticketWisePricing.js'
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
  /**
   * Un DNI por persona, también acá: el cliente ya lo marca, pero la orden se
   * puede armar sin pasar por el formulario. Dos entradas con el mismo
   * documento emiten dos QR que en la puerta se verifican contra la misma
   * persona, y el segundo rebota.
   */
  .superRefine((data, ctx) => {
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
  })
const accessSchema = z.object({ accessToken: z.string().trim().min(32) })
const rejectOrderSchema = z.object({ reason: z.string().trim().min(3).max(500) })

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
  const ticketAccessOverrideGuard = requirePermission('admin.events.write', { prisma })
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
  /**
   * "Tu entrada ya está paga". Se manda una sola vez por acreditación: la clave
   * de idempotencia lleva el `updated_at` de la orden, así que reaprobar una
   * orden ya aprobada (la RPC devuelve `duplicate`) no reenvía nada.
   *
   * El mail no linkea a una página de la entrada porque no existe: el QR vive
   * en la pestaña donde se compró. Lo que sí sirve en la puerta es el documento
   * de cada asistente, que el puesto de control puede buscar en la lista del
   * evento — por eso el dato que viaja es ese y no un link que no llevaría a
   * ningún lado.
   */
  async function sendTicketConfirmation(result) {
    const order = result?.order
    if (!order || result?.duplicate) return
    if (order.status !== 'aprobado' || !order.buyer_email) return

    const event = await athleteRepo()
      .findEventSummary(order.event_id)
      .catch(() => null)

    // Una compra de entrenador emite dos credenciales y es UNA entrada: se
    // cuentan las primarias, igual que el cupo.
    const tickets = Array.isArray(result.tickets) ? result.tickets : []
    const quantity =
      tickets.filter((ticket) => ticket.is_primary_credential !== false).length || tickets.length

    await sendBestEffort('ticket_confirmation', {
      to: order.buyer_email,
      toName: order.buyer_name,
      entityType: 'ticket_order',
      entityId: order.id,
      idempotencyKey: `email:ticket-confirmation:${order.id}:${order.updated_at}`,
      params: {
        name: order.buyer_name,
        eventTitle: event?.title ?? 'PLU ARG',
        eventDate: event?.starts_at ?? null,
        venue: event?.venue ?? null,
        quantity: String(quantity),
        reference: order.reference,
        ticketUrl: event?.slug ? `${appUrl}${buildEventPagePath(event.slug)}` : appUrl,
      },
    })
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
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'La vigencia individual es inválida.' })
      }
    })

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
        // `manual` cubre los tres canales que se acreditan a mano:
        // transferencia, efectivo en Pitbull y Wise. Cuál de ellos lo decide el
        // comprador y lo autoriza la matriz plataforma + override del evento.
        const ticketChannel =
          req.validatedBody.provider === 'manual'
            ? (req.validatedBody.manualPaymentChannel ?? 'bank_transfer')
            : 'mercado_pago'
        const eventPricing = await loadEventPaymentProfile(req.validatedBody.eventSlug)
        if (getSupabaseAdmin?.() && !eventPricing) {
          throw new HttpError(404, 'Evento no encontrado.')
        }
        assertEventPaymentChannelEnabled(toggles, 'ticket', ticketChannel, {
          eventOverrides: eventPricing?.payment_channel_overrides ?? null,
        })
        // Y contra los medios propios de cada tipo del carrito. El canal se
        // elige una vez para toda la compra, así que alcanza con que una
        // entrada no lo acepte para que la orden entera no se pueda cobrar
        // así. Sin esto la pantalla ofrecía transferencia para un palco que
        // sólo acepta Mercado Pago y el rechazo llegaba al confirmar el pago.
        await assertTicketTypesAcceptChannel(
          req.validatedBody.attendees,
          ticketChannel,
          eventPricing?.payment_channel_overrides ?? null,
        )
        // Y contra el calendario: una transferencia vendida sobre la fecha no
        // llega a ser un QR antes de que abra la puerta.
        assertManualTicketDeadline(ticketChannel, eventPricing?.starts_at ?? null)
        const ticketWiseQuote =
          ticketChannel === 'wise_transfer'
            ? await resolveTicketOrderWiseQuote(
                getSupabaseAdmin?.(),
                req.validatedBody,
                env,
                eventPricing,
              )
            : null
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
        const created = await repo().createOrder({
          ...req.validatedBody,
          // Precio calculado por la API, nunca por el cliente: el monto
          // por asistente (`wisePriceFor`) se multiplica acá y viaja como
          // total ya cerrado, igual que el resto de las órdenes manuales.
          wiseAmount: ticketWisePrice ? ticketWisePrice.amount : null,
          wiseCurrency: ticketWisePrice?.currency ?? null,
        })
        const mercadoPagoPublicKey = await resolveMercadoPagoPublicKeyForProfileId(
          getSupabaseAdmin?.(),
          eventPricing?.mercado_pago_profile_id,
          env,
        )
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
      const platformAvailability = resolvePublicCheckoutAvailability(toggles, env)
      const scoped = applyManualTicketDeadline(
        applyEventPaymentChannelOverrides(
          platformAvailability,
          eventPricing?.payment_channel_overrides,
        ),
        eventPricing?.starts_at ?? null,
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
          ticketManualEnabled: scoped.ticketManualEnabled,
          channels: scoped.paymentChannels.ticket,
          bankTransfer: resolveBankTransferDetails(eventPricing, env, bankProfile),
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
  router.post(
    '/orders/:orderId/approve',
    ...financeWriteGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        assertValidationEnabled(await platformSettingsRepo().get(), 'ticket')
        const result = await repo().approve(parseOrderId(req), actor(req))
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

  router.get(
    '/orders/:orderId/proof',
    ...financeReadGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const orderId = parseOrderId(req)
        const supabase = getSupabaseAdmin?.()
        if (!supabase) {
          throw new HttpError(503, 'Supabase no está configurado en el servidor.')
        }

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

  router.put(
    '/:ticketId/access-override',
    ...ticketAccessOverrideGuard,
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
      assertEventSlugScope(req, req.params.eventSlug)
      res.json(await repo().allowlist(req.params.eventSlug))
    } catch (error) {
      next(error)
    }
  })
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
            attempt.kind === 'ticket' && attempt.outcome !== 'not_found' && attempt.outcome !== 'invalid'
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

  router.post('/checkin/:qrToken', ...guard, staffLimiter, async (req, res, next) => {
    let ticket
    const gate = req.body?.gate || req.auth?.user?.securityZone?.name || 'Puerta'
    try {
      ticket = await repo().verify(req.params.qrToken)
      const eventId = verifiedTicketEventId(ticket)
      assertEventScope(req, eventId)
      assertTicketValidity(ticket)
      const zoneScope = await scannerZoneScope(req)
      const result = await repo().checkIn(req.params.qrToken, gate, actor(req), zoneScope)
      // Autoritativo: el servidor observó el ingreso. No bloquea la
      // respuesta -- un rastro de puerta perdido no puede volver a fallar
      // un check-in que ya se acreditó.
      void recordScanEvent(getSupabaseAdmin?.(), {
        eventId,
        outcome: 'checked_in',
        kind: 'ticket',
        evidence: 'server',
        ticketId: ticket?.ticket?.id ?? null,
        qrToken: req.params.qrToken,
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
          qrToken: req.params.qrToken,
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
        const ticket = await repo().verify(req.params.qrToken)
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
            req.body?.gate,
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
