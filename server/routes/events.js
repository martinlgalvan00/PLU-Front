import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../lib/errors.js'
import { PUBLIC_CACHE_SECONDS, publicReadCache } from '../lib/http.js'
import { logger } from '../lib/logger.js'
import { EVENT_LOGO_BUCKET, PROOF_BUCKET } from '../lib/supabaseAdmin.js'
import {
  assertSupabaseResult,
  isMissingSchemaColumn,
  requireSupabaseClient,
} from '../lib/supabaseRpc.js'
import { validateBody } from '../lib/validate.js'
import { requirePermission } from '../middleware/auth.js'
import { publicReadLimiter, staffLimiter } from '../middleware/rateLimit.js'
import { sanitizePublicCatalogEvent } from '../services/publicEventCatalogService.js'
import { buildTicketCredentialsPayload } from '../../src/lib/ticketCredentials.js'
import { resolveTicketTypeChannels } from '../../src/lib/ticketTypePaymentChannels.js'
import {
  MAX_TICKET_QR_VALIDITY_MINUTES,
  TICKET_ACCESS_USAGE_MODE,
  TICKET_ACCESS_USAGE_MODES,
  TICKET_QR_VALIDITY_MODE,
  TICKET_QR_VALIDITY_MODES,
} from '../../src/lib/ticketValidityPolicy.js'
import {
  bankTransferIssueError,
  checkEventBankTransferReady,
  normalizeBankTransferInput,
  normalizeCashPaymentInput,
  normalizePaymentChannelOverrides,
} from '../modules/payments/eventPaymentProfile.js'
import { createSupabasePaymentProfileRepository } from '../modules/payments/supabasePaymentProfileRepository.js'

/** Cuentas temporales de puerta: viven en Prisma, atadas al evento por uuid. */
const SECURITY_ROLE = 'seguridad_plu_arg'

const EVENT_SELECT = `
  *,
  capacityRules:event_capacity_rules(*),
  eventRegistrations:event_registrations(status),
  eventDays:event_days(*),
  comboOffer:event_combo_offers(
    id, membership_plan_id, price, manual_price, currency, active, starts_at, ends_at, audience, financed, archived_at
  ),
  ticketTypes:ticket_types(
    *,
    ticketTypeDays:ticket_type_days(event_day_id),
    includedAddons:ticket_type_included_addons(addon_id),
    credentials:ticket_type_credentials(id, label, zone_scopes, sort_order)
  )
`

/**
 * Lectura base del catálogo. `access_code` nunca entra; `audience` y
 * `archived_at` sólo viajan hasta sanitizePublicCatalogEvent, que elimina la
 * oferta completa si no corresponde anunciarla.
 *
 * `credentials` viaja al público a propósito: es lo que distingue una entrada
 * de espectador de una de entrenador, y el comprador tiene que poder leerlo
 * antes de pagar. No autoriza nada — el alcance que vale es el congelado en la
 * entrada emitida, que valida `staff_check_in_ticket` en el servidor.
 */
const CATALOG_TICKET_TYPE_EMBED = `
    ticketTypeDays:ticket_type_days(event_day_id),
    includedAddons:ticket_type_included_addons(addon_id),
    credentials:ticket_type_credentials(id, label, zone_scopes, sort_order)
`

function catalogEventSelect(ticketTypeColumns) {
  return `
  id, slug, title, description, venue, location,
  starts_at, ends_at,
  registration_opens_at, registration_closes_at,
  ticket_sales_opens_at, ticket_sales_closes_at,
  capacity, status, published, requires_membership, capacity_progress_public, price, manual_price, currency, rules,
  logo_path,
  scheduled_price, scheduled_manual_price, price_effective_at, wise_price,
  live_stream_url, live_stream_provider, live_status, created_at, updated_at,
  eventRegistrations:event_registrations(count),
  eventDays:event_days(id, day_index, label, date),
  comboOffer:event_combo_offers(
    id, membership_plan_id, price, manual_price, currency, active, starts_at, ends_at, audience, financed, archived_at
  ),
  ticketTypes:ticket_types(
    ${ticketTypeColumns}
    ${CATALOG_TICKET_TYPE_EMBED}
  )
`
}

const CATALOG_EVENT_SELECT = catalogEventSelect(
  'id, name, description, price, wise_price, manual_price, quota, sort_order, active, sales_opens_at, sales_closes_at, valid_from, valid_until, qr_validity_mode, qr_validity_duration_minutes, access_usage_mode, payment_channels,',
)
const CATALOG_EVENT_SELECT_COMPAT = catalogEventSelect(
  'id, name, price, quota, sort_order, active,',
)

async function readPublishedCatalog(client) {
  const run = (select) =>
    client
      .from('events')
      .select(select)
      .eq('published', true)
      .in('event_registrations.status', ACTIVE_REGISTRATION_STATUSES)
      .order('starts_at')

  const primary = await run(CATALOG_EVENT_SELECT)
  if (!primary.error) return withLogoUrls(client, primary.data)
  if (!isMissingSchemaColumn(primary.error)) {
    return assertSupabaseResult(primary, 'No se pudieron leer los eventos públicos.')
  }
  return withLogoUrls(
    client,
    assertSupabaseResult(
      await run(CATALOG_EVENT_SELECT_COMPAT),
      'No se pudieron leer los eventos públicos.',
    ),
  )
}

const ACTIVE_REGISTRATION_STATUSES = ['pendiente_pago', 'pagada', 'confirmada']

/**
 * Vocabulario de estados públicos del evento. `agotado` lo mantiene la base
 * (20260807140000): entra acá porque el editor igual puede mandarlo de vuelta
 * al guardar un evento que ya estaba lleno.
 */
const EVENT_STATUSES = [
  'proximamente',
  'inscripcion_abierta',
  'cupos_limitados',
  'agotado',
  'cerrado',
  'finalizado',
]

const boundedMoney = z.coerce.number().finite().int().min(0).max(10_000_000)
const paidMoney = z.coerce.number().finite().int().min(1).max(10_000_000)
const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => value ?? '')
  .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Fecha inválida.')
const optionalDateTime = z
  .string()
  .trim()
  .optional()
  .transform((value) => value ?? '')
  .refine((value) => value === '' || !Number.isNaN(Date.parse(value)), 'Fecha y hora inválidas.')

const ticketAddonSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(100),
  description: z.string().trim().max(240).optional(),
  price: boundedMoney,
  // Igual que el tipo de entrada: USD propio para Wise, o vacío y se convierte.
  wisePrice: z
    .preprocess(
      (value) => (value === '' || value === undefined ? null : value),
      z.coerce.number().int().min(1).max(100_000).nullable(),
    )
    .optional(),
  redeemLabel: z.string().trim().max(160).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
})

const pricingSchema = z
  .object({
    membership: boundedMoney,
    registration: paidMoney,
    // Precio para transferencia/efectivo. Vacío = cobra igual que `registration`
    // en cualquier canal.
    registrationManual: paidMoney.optional(),
    combo: boundedMoney,
    ticketsEnabled: z.boolean().optional(),
    ticketAddons: z.array(ticketAddonSchema).max(30).optional(),
  })
  .passthrough()

const eventDaySchema = z.object({
  dayIndex: z.coerce.number().int().min(0).max(30),
  label: z.string().trim().min(1).max(80),
  date: optionalDate,
})

const nullableQuota = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.coerce.number().int().min(0).max(100_000).nullable(),
)

/**
 * Subcategorías de la entrada: qué credenciales emite una compra de este tipo
 * y qué zonas abre cada una. Una entrada común declara una; la de entrenador,
 * dos (espectador + entrada en calor). Los topes son espejo de
 * `staff_merge_ticket_type_credentials` y de `src/lib/ticketCredentials.js`.
 */
const ticketCredentialSchema = z.object({
  label: z.string().trim().min(1).max(40),
  zoneScopes: z
    .array(z.enum(['gate_tickets', 'athletes_only', 'athletes_coaches', 'staff_only']))
    .min(1)
    .max(4),
})

/**
 * Precio en USD del tipo de entrada para pagos por Wise. Vacío = se deriva del
 * precio en ARS por el dólar configurado, que es el comportamiento anterior.
 * El techo es espejo de `ticket_types_wise_price_check`.
 */
const nullableWisePrice = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.coerce.number().int().min(1).max(100_000).nullable(),
)

/**
 * Precio en ARS del tipo de entrada para transferencia y efectivo (mismo
 * valor para los dos). Vacío = cobra igual que `price` en cualquier canal. El
 * techo es espejo de `ticket_types_manual_price_check`; que no supere `price`
 * se valida en el refine de `ticketTypeSchema`, no acá.
 */
const nullableManualPrice = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.coerce.number().int().min(1).max(10_000_000).nullable(),
)

const eventPaymentChannelFlagsSchema = z.object({
  mercado_pago: z.boolean().optional(),
  bank_transfer: z.boolean().optional(),
  cash_pitbull: z.boolean().optional(),
  wise_transfer: z.boolean().optional(),
})

const ticketTypeSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(240).optional(),
    price: boundedMoney,
    wisePrice: nullableWisePrice.optional(),
    manualPrice: nullableManualPrice.optional(),
    quota: nullableQuota.optional(),
    sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
    active: z.boolean().optional(),
    // Ventana propia del tipo. Sólo cierra antes que la del evento: la RPC
    // evalúa las dos y la primera que corta gana.
    salesOpensAt: optionalDateTime,
    salesClosesAt: optionalDateTime,
    validFrom: optionalDateTime,
    validUntil: optionalDateTime,
    validityMode: z.enum(TICKET_QR_VALIDITY_MODES).optional(),
    validityDurationMinutes: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_TICKET_QR_VALIDITY_MINUTES)
      .nullable()
      .optional(),
    accessUsageMode: z.enum(TICKET_ACCESS_USAGE_MODES).optional(),
    dayIndexes: z.array(z.coerce.number().int().min(0).max(30)).max(31).optional(),
    includedAddonIds: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
    credentials: z.array(ticketCredentialSchema).min(1).max(4).optional(),
    // Medios de cobro propios de esta entrada. NULL = heredar los del evento,
    // que es lo que tienen todas las filas anteriores a la columna. El objeto
    // sólo puede CERRAR debajo del evento; que quede sin ninguno abierto se
    // rechaza más abajo, donde se ve el override del evento.
    paymentChannels: eventPaymentChannelFlagsSchema.strict().nullable().optional(),
  })
  .superRefine((type, ctx) => {
    // Un "descuento" por encima del precio de lista no tiene sentido
    // comercial y rompe el supuesto de las vidrieras (que siempre anuncian el
    // precio de Mercado Pago, el techo). Espejo de la validación en
    // `staff_upsert_event`.
    if (type.manualPrice != null && type.manualPrice > type.price) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['manualPrice'],
        message: 'El precio con descuento no puede superar el precio de lista.',
      })
    }
    const validityMode =
      type.validityMode ??
      (type.validFrom || type.validUntil
        ? TICKET_QR_VALIDITY_MODE.FIXED_WINDOW
        : TICKET_QR_VALIDITY_MODE.EVENT_DAYS)
    if (
      validityMode === TICKET_QR_VALIDITY_MODE.FIXED_WINDOW &&
      Boolean(type.validFrom) !== Boolean(type.validUntil)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['validUntil'],
        message: 'Completá inicio y fin de vigencia del QR, o dejá ambos vacíos.',
      })
    } else if (
      validityMode === TICKET_QR_VALIDITY_MODE.FIXED_WINDOW &&
      type.validFrom &&
      type.validUntil &&
      type.validFrom >= type.validUntil
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['validUntil'],
        message: 'El vencimiento del QR debe ser posterior a su inicio.',
      })
    }
    if (
      [TICKET_QR_VALIDITY_MODE.FROM_PAYMENT, TICKET_QR_VALIDITY_MODE.FROM_FIRST_SCAN].includes(
        validityMode,
      ) &&
      !type.validityDurationMinutes
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['validityDurationMinutes'],
        message: 'Indicá cuánto dura el QR desde la acreditación del pago.',
      })
    }
    if (
      [TICKET_QR_VALIDITY_MODE.FROM_PAYMENT, TICKET_QR_VALIDITY_MODE.FROM_FIRST_SCAN].includes(
        validityMode,
      ) &&
      (type.validFrom || type.validUntil)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['validFrom'],
        message: 'La duración desde pago no puede combinarse con una ventana fija.',
      })
    }
    if (
      type.accessUsageMode === TICKET_ACCESS_USAGE_MODE.ONCE_PER_EVENT_DAY &&
      validityMode !== TICKET_QR_VALIDITY_MODE.EVENT_DAYS
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accessUsageMode'],
        message: 'Un ingreso por jornada sólo puede usarse con jornadas asignadas.',
      })
    }
  })

// A nivel evento un canal se cierra (`false`) o se abre aunque la plataforma lo
// tenga cerrado (`'open'`). El tipo de entrada sigue siendo sólo booleano:
// únicamente puede cerrar debajo del evento.
const eventChannelDecisionSchema = z.union([z.boolean(), z.literal('open')]).optional()

const eventChannelDecisionsSchema = z.object({
  mercado_pago: eventChannelDecisionSchema,
  bank_transfer: eventChannelDecisionSchema,
  cash_pitbull: eventChannelDecisionSchema,
  wise_transfer: eventChannelDecisionSchema,
})

const eventPaymentChannelsByConceptSchema = z
  .object({
    registration: eventChannelDecisionsSchema.strict().optional(),
    ticket: eventChannelDecisionsSchema.strict().optional(),
  })
  .strict()

const weighInWindowSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  label: z.string().trim().min(1).max(80),
  date: optionalDate,
  startsAt: optionalDateTime,
  endsAt: optionalDateTime,
  note: z.string().trim().max(160).optional(),
  sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
})

export const eventSchema = z
  .object({
    id: z.string().uuid().optional(),
    expectedUpdatedAt: optionalDateTime,
    slug: z
      .string()
      .trim()
      .min(2)
      .max(160)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug inválido.'),
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(1000).optional(),
    venue: z.string().trim().min(2).max(120),
    location: z.string().trim().min(2).max(120),
    startsAt: z
      .string()
      .trim()
      .refine((value) => !Number.isNaN(Date.parse(value)), 'Inicio inválido.'),
    endsAt: z
      .string()
      .trim()
      .refine((value) => !Number.isNaN(Date.parse(value)), 'Fin inválido.'),
    status: z.enum(EVENT_STATUSES),
    published: z.boolean(),
    requiresMembership: z.boolean().default(true),
    // Si el sitio público muestra cuántos se anotaron y el progreso del cupo.
    // El panel lo ve siempre: sólo gobierna la proyección pública.
    capacityProgressPublic: z.boolean().default(true),
    // Independiente: si el medidor también publica el número total (“de 200”).
    capacityTotalPublic: z.boolean().default(true),
    slots: z.coerce.number().int().min(1).max(5000),
    pricing: pricingSchema,
    featured: z.boolean().optional(),
    registrationOpensAt: optionalDateTime,
    registrationClosesAt: optionalDateTime,
    ticketSalesOpensAt: optionalDateTime,
    ticketSalesClosesAt: optionalDateTime,
    eventDays: z.array(eventDaySchema).max(31).optional(),
    ticketTypes: z.array(ticketTypeSchema).max(50).optional(),
    weighInWindows: z.array(weighInWindowSchema).max(60).optional(),
    publicSurface: z
      .object({
        calendar: z.boolean().optional(),
        weighIns: z.boolean().optional(),
        livestream: z.boolean().optional(),
        experience: z.boolean().optional(),
        categories: z.boolean().optional(),
        location: z.boolean().optional(),
      })
      .optional(),
    // Copy del hero público. Techos espejo de la RPC de merge y del esquema
    // del cliente (`src/lib/schemas/adminEvent.js`).
    publicCopy: z
      .object({
        publicTitle: z.string().trim().max(120).optional(),
        heroLead: z.string().trim().max(240).optional(),
        ctaLabel: z.string().trim().max(40).optional(),
        inscriptionMark: z.string().trim().max(40).optional(),
        inscriptionNote: z.string().trim().max(160).optional(),
      })
      .optional(),
    liveStreamUrl: z
      .string()
      .trim()
      .max(500)
      .optional()
      .refine(
        (value) => !value || /^https?:\/\//i.test(value),
        'La URL del stream debe comenzar con http:// o https://.',
      ),
    liveStreamProvider: z.enum(['youtube', 'instagram', 'twitch']).optional(),
    liveStatus: z.enum(['offline', 'live', 'ended']).optional(),
    // NULL = heredar matriz de plataforma. Objeto = decisiones del evento: cierra
    // (`false`) o abre (`'open'`) un canal; sin clave hereda la plataforma.
    //
    // Se acepta por concepto —`{registration, ticket}`, que es lo que manda el
    // panel— y también la forma plana vieja, que vale para los dos. Los dos
    // esquemas son `strict()` a propósito: sin eso un objeto por concepto
    // entraría por la rama plana, zod descartaría las claves desconocidas y el
    // override llegaría vacío al guardado.
    paymentChannelOverrides: z
      .union([eventPaymentChannelsByConceptSchema, eventChannelDecisionsSchema.strict()])
      .nullable()
      .optional(),
    bankTransfer: z
      .object({
        alias: z.string().trim().max(120).optional(),
        cbu: z.string().trim().max(30).optional(),
        holder: z.string().trim().max(160).optional(),
      })
      .nullable()
      .optional(),
    bankTransferProfileId: z.string().uuid().nullable().optional(),
    mercadoPagoProfileId: z.string().uuid().nullable().optional(),
    // Efectivo en el lugar: vacío = la sede del evento.
    cashPayment: z
      .object({
        place: z.string().trim().max(160).optional(),
        notes: z.string().trim().max(400).optional(),
      })
      .nullable()
      .optional(),
  })
  .superRefine((event, context) => {
    if (new Date(event.endsAt) < new Date(event.startsAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'El fin debe ser posterior al inicio.',
      })
    }

    const orderedWindows = [
      ['registrationOpensAt', 'registrationClosesAt'],
      ['ticketSalesOpensAt', 'ticketSalesClosesAt'],
    ]
    for (const [opensKey, closesKey] of orderedWindows) {
      if (
        event[opensKey] &&
        event[closesKey] &&
        new Date(event[closesKey]) < new Date(event[opensKey])
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [closesKey],
          message: 'La fecha de cierre debe ser posterior a la apertura.',
        })
      }
    }

    const dayIndexes = new Set()
    for (const [index, day] of (event.eventDays ?? []).entries()) {
      if (dayIndexes.has(day.dayIndex)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['eventDays', index, 'dayIndex'],
          message: 'No puede haber dos jornadas con el mismo orden.',
        })
      }
      dayIndexes.add(day.dayIndex)
    }

    const addonIds = new Set((event.pricing.ticketAddons ?? []).map((addon) => addon.id))
    for (const [index, ticketType] of (event.ticketTypes ?? []).entries()) {
      if (
        event.pricing.ticketsEnabled === true &&
        ticketType.active !== false &&
        Number(ticketType.price) > 0 &&
        (ticketType.dayIndexes ?? []).length === 0
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ticketTypes', index, 'dayIndexes'],
          message: 'Cada entrada a la venta necesita al menos un día de validez.',
        })
      }
      if ((ticketType.dayIndexes ?? []).some((dayIndex) => !dayIndexes.has(dayIndex))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ticketTypes', index, 'dayIndexes'],
          message: 'El tipo de entrada referencia una jornada inexistente.',
        })
      }
      if ((ticketType.includedAddonIds ?? []).some((addonId) => !addonIds.has(addonId))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ticketTypes', index, 'includedAddonIds'],
          message: 'El tipo de entrada referencia un beneficio inexistente.',
        })
      }
      // Ventana propia invertida: el tipo nunca se podría comprar. Espejo del
      // check de `ticket_types_sales_window_check`, pero acá el error apunta a
      // la fila que lo causó en vez de rebotar la RPC entera.
      if (
        ticketType.salesOpensAt &&
        ticketType.salesClosesAt &&
        ticketType.salesOpensAt >= ticketType.salesClosesAt
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ticketTypes', index, 'salesClosesAt'],
          message: 'La venta de este tipo cierra antes de abrir.',
        })
      }
    }

    if (event.pricing.ticketsEnabled === true) {
      if (!(event.eventDays ?? []).length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['eventDays'],
          message: 'La venta de entradas necesita al menos un día del evento.',
        })
      }
      const sellableTypes = (event.ticketTypes ?? []).filter(
        (ticketType) => ticketType.active !== false && Number(ticketType.price) > 0,
      )
      if (sellableTypes.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ticketTypes'],
          message: 'La venta de entradas necesita al menos un tipo activo con precio.',
        })
      }
    }

    for (const [index, window] of (event.weighInWindows ?? []).entries()) {
      if (!window.startsAt) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['weighInWindows', index, 'startsAt'],
          message: 'Cada franja de pesaje necesita horario de apertura.',
        })
      }
      if (!window.endsAt) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['weighInWindows', index, 'endsAt'],
          message: 'Cada franja de pesaje necesita horario de cierre.',
        })
      }
      if (window.startsAt && window.endsAt && window.startsAt >= window.endsAt) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['weighInWindows', index, 'endsAt'],
          message: 'El cierre del pesaje tiene que ser después de la apertura.',
        })
      }
    }
  })

/**
 * Cambio de estado sin pasar por el upsert completo. Los dos campos son
 * opcionales e independientes -- se puede despublicar sin tocar el estado --
 * pero mandar el body vacío no tiene sentido y se rechaza acá en vez de gastar
 * un viaje a la base.
 */
const eventStateSchema = z
  .object({
    status: z.enum(EVENT_STATUSES).optional(),
    published: z.boolean().optional(),
    // Habilitar/deshabilitar el meet como "solo afiliados" sin pasar por el
    // upsert: era el único flag de la operación diaria que obligaba a
    // reescribir el evento entero (y con él la grilla ya asignada).
    requiresMembership: z.boolean().optional(),
    // Mostrar/ocultar la ocupación pública (contador y barra) sin reescribir
    // el evento: misma clase de decisión operativa que los dos de arriba.
    capacityProgressPublic: z.boolean().optional(),
  })
  .refine(
    (body) =>
      body.status !== undefined ||
      body.published !== undefined ||
      body.requiresMembership !== undefined ||
      body.capacityProgressPublic !== undefined,
    'No hay ningún cambio para aplicar.',
  )

/** Tandas de un evento: el grupo con el que un atleta entra a plataforma. */
const eventSessionSchema = z.object({
  id: z.string().uuid().optional(),
  dayIndex: z.coerce.number().int().min(0).max(30),
  name: z.string().trim().min(1).max(80),
  platform: z.string().trim().max(80).optional(),
  // Sin la clave, el RPC enlaza por nombre (editor legado de solo texto); con
  // null, la tanda queda sin tablado.
  platformId: z.string().uuid().nullable().optional(),
  weighInAt: optionalDateTime,
  startsAt: optionalDateTime,
  sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
})

const eventSessionsSchema = z.object({
  sessions: z.array(eventSessionSchema).max(60),
})

/**
 * Tablados del evento: 1 o 2 en la práctica (el RPC admite hasta 4). El set
 * viaja completo; lo que no viene se quita y sus tandas quedan sin tablado.
 */
const eventSchedulePublicSchema = z.object({ public: z.boolean() })

/**
 * Plantilla de grilla: configuración reutilizable entre eventos. `.strict()` a
 * propósito -- la plantilla se guarda como jsonb y se vuelve a leer en el
 * cliente, así que una clave de más no se tira en silencio: se rechaza.
 */
const weightClassBounds = z.array(z.number().positive().max(300)).max(15)
const gridTemplateConfigSchema = z
  .object({
    platforms: z.array(z.string().trim().min(1).max(80)).max(4),
    maxPerSession: z.coerce.number().int().min(1).max(100),
    groupBy: z.array(z.enum(['sex', 'category', 'division'])).max(3),
    sortBy: z.enum(['weight', 'age']),
    mergeSmall: z.boolean(),
    platformMode: z.enum(['balance', 'alternate', 'sex']),
    weightClasses: z
      .object({ Femenino: weightClassBounds.optional(), Masculino: weightClassBounds.optional() })
      .strict()
      .nullable()
      .optional(),
    schedule: z
      .object({
        firstStart: z.string().regex(/^\d{1,2}:\d{2}$/),
        sessionMinutes: z.coerce.number().int().min(1).max(600),
        minutesPerAthlete: z.coerce.number().min(0.5).max(60).optional(),
        gapMinutes: z.coerce.number().int().min(0).max(240),
        weighInLeadMinutes: z.coerce.number().int().min(0).max(720),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict()

const gridTemplateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  config: gridTemplateConfigSchema,
})

const eventPlatformsSchema = z.object({
  platforms: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(80),
      }),
    )
    .max(4),
})

/**
 * Asignación de grilla. `dayIndex`/`sessionId` en null limpian la asignación:
 * es cómo se deshace un reparto equivocado sin tener que borrar la inscripción.
 */
const assignScheduleSchema = z
  .object({
    registrationIds: z.array(z.string().uuid()).min(1).max(500),
    dayIndex: z.coerce.number().int().min(0).max(30).nullable().optional(),
    sessionId: z.string().uuid().nullable().optional(),
  })
  .transform((body) => ({
    registrationIds: body.registrationIds,
    dayIndex: body.dayIndex ?? null,
    sessionId: body.sessionId ?? null,
  }))

/**
 * Reparto sugerido. El tope por tanda es lo que decide el operador: en
 * powerlifting una tanda suele ir de 10 a 14 atletas, pero depende de la sede
 * y de cuántas plataformas haya.
 */
const autofillSchema = z.object({
  dayIndex: z.coerce.number().int().min(0).max(30),
  maxPerSession: z.coerce.number().int().min(1).max(100),
})

const EVENT_LOGO_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const EVENT_LOGO_MAX_BYTES = 3 * 1024 * 1024

const logoUploadSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  size: z.number().int().min(1).max(EVENT_LOGO_MAX_BYTES),
})

const logoSetSchema = z.object({
  path: z
    .string()
    .trim()
    .max(200)
    .regex(/^[A-Za-z0-9._()+/-]+$/, 'Ruta de logo inválida.')
    .nullable(),
})

function parseEventSlug(value) {
  const slug = String(value ?? '').trim()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new HttpError(400, 'Slug de evento inválido.')
  }
  return slug
}

/**
 * Comprobantes de transferencia de las órdenes de entradas del evento borrado.
 * Mismo criterio que el borrado de atletas: es best-effort -- un archivo
 * huérfano en storage no justifica revertir un borrado que ya se confirmó en
 * la base, pero sí queda avisado en el log.
 */
async function removeTicketProofs(client, orderIds) {
  for (const orderId of Array.isArray(orderIds) ? orderIds : []) {
    const listed = await client.storage.from(PROOF_BUCKET).list(orderId, { limit: 100 })
    if (listed.error) {
      console.warn(`No se pudieron listar comprobantes de ${orderId}:`, listed.error.message)
      continue
    }
    const paths = (listed.data ?? []).map((file) => `${orderId}/${file.name}`)
    if (paths.length === 0) continue
    const removal = await client.storage.from(PROOF_BUCKET).remove(paths)
    if (removal.error) {
      console.warn(`No se pudieron borrar comprobantes de ${orderId}:`, removal.error.message)
    }
  }
}

/**
 * Select del panel sin las credenciales de entrada. Es el mismo, y existe por
 * una sola razón: si el código llega a un entorno donde todavía no corrió la
 * migración de `ticket_type_credentials`, PostgREST no falla el embed, falla la
 * CONSULTA ENTERA -- y la sección de eventos se cae del todo por una tabla que
 * sólo hace falta para una subpestaña.
 */
const EVENT_SELECT_SIN_CREDENCIALES = EVENT_SELECT.replace(
  /,\s*credentials:ticket_type_credentials\([^)]*\)/,
  '',
)

/**
 * PostgREST cuando no encuentra algo en el schema cache: PGRST200 es una tabla
 * o su relación, PGRST202 una función. Los dos casos son "la migración no
 * corrió acá todavía", no "el pedido estaba mal".
 */
function esRelacionFaltante(error) {
  return (
    error?.code === 'PGRST200' ||
    error?.code === 'PGRST202' ||
    /schema cache/i.test(error?.message ?? '')
  )
}

/** Ruta de Storage del logo -> URL pública estable del bucket. */
function eventLogoPublicUrl(client, path) {
  if (!path) return null
  return client.storage.from(EVENT_LOGO_BUCKET).getPublicUrl(path).data.publicUrl
}

/** Suma `logo_url` a cada fila: el panel no conoce el bucket ni el dominio de Storage. */
function withLogoUrls(client, rows) {
  return (rows ?? []).map((row) => ({
    ...row,
    logo_url: eventLogoPublicUrl(client, row.logo_path),
  }))
}

async function readEvents(client) {
  return withLogoUrls(client, await readEventRows(client))
}

async function readEventRows(client) {
  const result = await client.from('events').select(EVENT_SELECT).order('starts_at')

  // Degradar antes que caerse: sin la migración aplicada el panel sigue
  // funcionando y lo único que falta es el detalle de credenciales por tipo de
  // entrada. El aviso queda en el log del servidor para que la deuda se vea.
  if (result.error && esRelacionFaltante(result.error)) {
    console.warn(
      '[eventos] `ticket_type_credentials` no existe en esta base: se leen los eventos sin las credenciales de entrada. Aplicá la migración 20261107100000_ticket_credential_classes.sql.',
    )
    return assertSupabaseResult(
      await client.from('events').select(EVENT_SELECT_SIN_CREDENCIALES).order('starts_at'),
      'No se pudieron leer los eventos.',
    )
  }

  return assertSupabaseResult(result, 'No se pudieron leer los eventos.')
}

function attachRecentRegistrationPortraits(summary) {
  // Listados públicos de "inscritos recientes" van sin foto: con tráfico real
  // cada visitante re-bajaba N retratos (Storage egress). Las iniciales
  // alcanzan; el spotlight de comunidad limita a 1 foto (budget de egress).
  const recent = Array.isArray(summary?.recent) ? summary.recent : []
  const entries = recent.map((item) => {
    const { photoPath: _photoPath, photo_path: _photoPathSnake, ...entry } = item ?? {}
    return { ...entry, photoUrl: null }
  })

  return { ...summary, recent: entries }
}

export function createEventRoutes({ getPrisma, getSupabaseAdmin }) {
  const router = Router()
  const prisma = getPrisma()
  const editGuard = requirePermission('admin.events.write', { prisma })
  const viewGuard = requirePermission('admin.events.read', { prisma })
  // La grilla es dato de inscripciones, no de configuración del evento: quien
  // arma el reparto de atletas no necesariamente puede editar precios y fechas.
  const registrationsViewGuard = requirePermission('admin.registrations.read', { prisma })
  const registrationsEditGuard = requirePermission('admin.registrations.write', { prisma })
  // Borrar un evento no es "editarlo mucho": se lleva inscripciones pagadas,
  // entradas y acreditaciones. Mismo techo que el borrado de atletas y de
  // cuentas de staff -- solo Super Admin, no `admin.events.write`.
  const deleteGuard = requirePermission('admin.events.delete', { prisma })

  router.get('/', ...viewGuard, staffLimiter, async (_req, res, next) => {
    try {
      const client = requireSupabaseClient(getSupabaseAdmin())
      const events = await readEvents(client)
      res.json({ events })
    } catch (error) {
      next(error)
    }
  })

  /**
   * Catálogo público (sin auth): eventos publicados con `registration_opens_at`
   * y pricing visible. Alimenta countdown / soft-launch del sitio sin depender
   * del seed local ni de RLS del cliente.
   */
  router.get('/catalog', publicReadLimiter, async (_req, res, next) => {
    try {
      const client = requireSupabaseClient(getSupabaseAdmin())
      const events = await readPublishedCatalog(client)
      // Cambiar una oferta es una accion deliberada del staff: no puede quedar
      // visible por stale-while-revalidate despues de apagarla o borrarla.
      res.set('Cache-Control', 'no-store')
      res.json({
        events: Array.isArray(events) ? events.map((row) => sanitizePublicCatalogEvent(row)) : [],
      })
    } catch (error) {
      next(error)
    }
  })

  /**
   * Grilla pública del evento (sin auth): tandas por tablado con su composición.
   * Apagada o con el evento sin publicar devuelve `{ enabled: false }` y nada
   * más. Nunca lleva nombres: ver `public_event_schedule`.
   */
  router.get('/:eventSlug/schedule-public', publicReadLimiter, async (req, res, next) => {
    try {
      const slug = parseEventSlug(req.params.eventSlug)
      const client = requireSupabaseClient(getSupabaseAdmin())
      const schedule = assertSupabaseResult(
        await client.rpc('public_event_schedule', { p_event_slug: slug }),
        'No se pudo consultar la grilla del evento.',
      )
      // Apagar la grilla es una decisión deliberada del staff: cache corto y sin
      // stale-while-revalidate, así que deja de verse a lo sumo en 10 s.
      res.set('Cache-Control', publicReadCache(PUBLIC_CACHE_SECONDS.LIVE, { staleFor: 0 }))
      res.json({ schedule })
    } catch (error) {
      next(error)
    }
  })

  router.get('/:eventSlug/registration-summary', publicReadLimiter, async (req, res, next) => {
    try {
      const slug = parseEventSlug(req.params.eventSlug)

      const client = requireSupabaseClient(getSupabaseAdmin())
      const summary = assertSupabaseResult(
        await client.rpc('get_event_registration_capacity', { p_event_slug: slug }),
        'No se pudo consultar el cupo de inscripción.',
      )
      // El hook de cupo la pide cada 30 s por visitante (`LIVE_REGISTRATION_POLL_MS`):
      // en una difusión son cientos de invocaciones por minuto contra el mismo número.
      res.set('Cache-Control', publicReadCache(PUBLIC_CACHE_SECONDS.LIVE))
      res.json({ summary: attachRecentRegistrationPortraits(summary) })
    } catch (error) {
      next(error)
    }
  })

  router.post(
    '/upsert',
    ...editGuard,
    staffLimiter,
    validateBody(eventSchema),
    async (req, res, next) => {
      try {
        const client = requireSupabaseClient(getSupabaseAdmin())
        const mode = req.validatedBody.id ? 'updated' : 'created'
        const paymentChannelOverrides = normalizePaymentChannelOverrides(
          req.validatedBody.paymentChannelOverrides,
        )
        let bankTransfer = normalizeBankTransferInput(req.validatedBody.bankTransfer)
        let bankTransferProfileId =
          req.validatedBody.bankTransferProfileId === undefined
            ? undefined
            : req.validatedBody.bankTransferProfileId
        const profiles = createSupabasePaymentProfileRepository(client)
        let linkedProfile = null
        const profileWarnings = []

        // Si eligieron un perfil del catálogo, manda ese. Si cargaron alias
        // suelto sin perfil, se crea/reusa uno para poder reutilizarlo después.
        if (bankTransferProfileId) {
          linkedProfile = await profiles.findById(bankTransferProfileId)
          if (!linkedProfile || linkedProfile.kind !== 'bank_transfer') {
            throw new HttpError(400, 'El perfil de cobro no es válido.')
          }
          bankTransfer = {
            alias: linkedProfile.config.alias,
            cbu: linkedProfile.config.cbu,
            holder: linkedProfile.config.holder,
          }
        } else if (bankTransfer.alias) {
          // El perfil es una comodidad (reusar la cuenta en otros eventos), no
          // un requisito del guardado: si no se puede crear, el evento se guarda
          // igual con el alias en sus columnas, que es lo que lee el checkout, y
          // se avisa. Antes un fallo acá cortaba todo y el operador perdía
          // también lo que había cambiado en el resto del evento.
          try {
            linkedProfile = await profiles.ensureBankTransferProfile({
              name: `Transferencia · ${req.validatedBody.title || req.validatedBody.slug}`,
              ...bankTransfer,
            })
            bankTransferProfileId = linkedProfile.id
          } catch (error) {
            logger.warn('event.bank_profile_not_saved', {
              slug: req.validatedBody.slug,
              err: error,
            })
            // Desvincula el perfil anterior: si no, el checkout seguiría
            // mostrando la cuenta vieja y no el alias que se acaba de cargar.
            bankTransferProfileId = null
            profileWarnings.push({
              code: 'EVENT_BANK_PROFILE_NOT_SAVED',
              message:
                'El evento se guardó, pero no pudimos guardar la cuenta de transferencia como perfil reutilizable. Los datos cargados igual se usan en este evento.',
              field: 'bankTransferProfileId',
            })
          }
        } else if (bankTransferProfileId === null) {
          // Explicitamente sin perfil: limpia el vínculo.
          bankTransferProfileId = null
        }

        // Un evento oculto se puede guardar con el cobro a medio configurar: nadie
        // puede pagarle todavía, y obligar a completar el alias para cambiar un
        // título trababa cualquier edición. Se guarda y se avisa. Publicado sí
        // se rechaza: ahí un comprador podría llegar a una transferencia sin
        // destino.
        const warnings = [...profileWarnings]
        const bankTransferIssue = checkEventBankTransferReady({
          overrides: paymentChannelOverrides,
          bankTransfer,
          bankTransferProfileId: bankTransferProfileId ?? null,
          profile: linkedProfile,
          env: process.env,
        })
        if (bankTransferIssue) {
          if (req.validatedBody.published === true) throw bankTransferIssueError(bankTransferIssue)
          warnings.push({
            code: bankTransferIssue.code,
            message: bankTransferIssue.message,
            field: bankTransferIssue.field,
          })
        }

        // Un tipo de entrada sólo puede cerrar debajo del evento. Que no le
        // quede ninguno abierto —porque cerró los últimos, o porque el evento
        // cerró después el único que tenía— es una entrada que no se puede
        // comprar por ningún lado, y el 409 aparecía recién al confirmar. El
        // constraint de la tabla cubre el primer caso; el cruce contra el
        // evento sólo se puede hacer acá, donde llegan los dos juntos.
        for (const ticketType of req.validatedBody.ticketTypes ?? []) {
          if (ticketType.active === false) continue
          if (!ticketType.paymentChannels) continue
          const open = resolveTicketTypeChannels({
            eventOverrides: paymentChannelOverrides,
            typeChannels: ticketType.paymentChannels,
          })
          if (open.length === 0) {
            throw new HttpError(
              400,
              `La entrada "${ticketType.name}" no acepta ningún medio de pago.`,
            )
          }
        }

        const pEvent = {
          ...req.validatedBody,
          paymentChannelOverrides,
          bankTransfer,
        }
        if (bankTransferProfileId !== undefined) {
          pEvent.bankTransferProfileId = bankTransferProfileId
        }

        let mercadoPagoProfileId =
          req.validatedBody.mercadoPagoProfileId === undefined
            ? undefined
            : req.validatedBody.mercadoPagoProfileId
        if (mercadoPagoProfileId) {
          const mpProfile = await profiles.findById(mercadoPagoProfileId)
          if (!mpProfile || mpProfile.kind !== 'mercado_pago' || !mpProfile.active) {
            throw new HttpError(400, 'El perfil de Mercado Pago no es válido.')
          }
        }
        if (mercadoPagoProfileId !== undefined) {
          pEvent.mercadoPagoProfileId = mercadoPagoProfileId
        }

        const savedEvent = assertSupabaseResult(
          await client.rpc('staff_save_event', {
            p_event: pEvent,
            p_actor: `${req.auth.user.id}:${req.auth.user.email}`,
          }),
          'No se pudo guardar el evento.',
        )

        const publicSurface = {
          calendar: pEvent.publicSurface?.calendar !== false,
          weighIns: pEvent.publicSurface?.weighIns !== false,
          livestream: pEvent.publicSurface?.livestream !== false,
          experience: pEvent.publicSurface?.experience !== false,
          categories: pEvent.publicSurface?.categories !== false,
          location: pEvent.publicSurface?.location !== false,
        }
        assertSupabaseResult(
          await client.rpc('staff_merge_event_public_surface', {
            p_slug: pEvent.slug,
            p_surface: publicSurface,
          }),
          'No se pudo guardar la superficie pública del evento.',
        )

        // Mismo motivo que la superficie: `staff_upsert_event` reconstruye
        // `rules` clave por clave, así que el copy va en su propio merge.
        assertSupabaseResult(
          await client.rpc('staff_merge_event_public_copy', {
            p_slug: pEvent.slug,
            p_copy: {
              publicTitle: pEvent.publicCopy?.publicTitle ?? '',
              heroLead: pEvent.publicCopy?.heroLead ?? '',
              ctaLabel: pEvent.publicCopy?.ctaLabel ?? '',
              inscriptionMark: pEvent.publicCopy?.inscriptionMark ?? '',
              inscriptionNote: pEvent.publicCopy?.inscriptionNote ?? '',
            },
          }),
          'No se pudo guardar el copy público del evento.',
        )

        // Misma razón: el upsert no escribe columnas nuevas. El total público
        // viaja aparte para no redefinir staff_upsert_event.
        const totalPublicMerge = await client.rpc('staff_merge_event_capacity_total', {
          p_slug: pEvent.slug,
          p_total_public: pEvent.capacityTotalPublic !== false,
        })

        // Sin esta RPC el staff_save_event ya corrió y pisó `updated_at`.
        // Abortar acá devolvía 500 y el reintento chocaba con PLU09.
        if (totalPublicMerge.error && esRelacionFaltante(totalPublicMerge.error)) {
          console.warn(
            '[eventos] `staff_merge_event_capacity_total` no existe en esta base: el evento se guardó sin la visibilidad del cupo total. Aplicá la migración 20261116100000_event_capacity_total_public.sql.',
          )
        } else {
          assertSupabaseResult(
            totalPublicMerge,
            'No se pudo guardar la visibilidad del cupo total.',
          )
        }

        // Dónde se cobra el efectivo: columnas nuevas, mismo merge post-save.
        // Sin la migración el evento se guarda igual; si alguien cargó un
        // lugar, se avisa en vez de perderlo en silencio.
        if (req.validatedBody.cashPayment !== undefined) {
          const cashPayment = normalizeCashPaymentInput(req.validatedBody.cashPayment)
          const cashMerge = await client.rpc('staff_merge_event_cash_payment', {
            p_slug: pEvent.slug,
            p_place: cashPayment.place,
            p_notes: cashPayment.notes,
          })
          if (cashMerge.error && esRelacionFaltante(cashMerge.error)) {
            console.warn(
              '[eventos] `staff_merge_event_cash_payment` no existe en esta base: el evento se guardó sin el lugar del efectivo. Aplicá la migración 20261216100000_event_cash_payment_place.sql.',
            )
            if (cashPayment.place || cashPayment.notes) {
              warnings.push({
                code: 'EVENT_CASH_PAYMENT_NOT_SAVED',
                message:
                  'El evento se guardó, pero el lugar del efectivo todavía no: falta aplicar una migración en la base. Mientras tanto se muestra la sede del evento.',
                field: 'cashPayment.place',
              })
            }
          } else {
            assertSupabaseResult(cashMerge, 'No se pudo guardar el lugar del efectivo.')
          }
        }

        // Las subcategorías de entrada (qué credenciales emite cada tipo y qué
        // zonas abre cada una) van en su propio merge por el mismo motivo que
        // las dos de arriba, y además porque cuelgan de tipos de entrada cuyos
        // ids recién existen después del guardado.
        if (Array.isArray(pEvent.ticketTypes) && pEvent.ticketTypes.length > 0) {
          const descriptions = await client.rpc('staff_merge_ticket_type_descriptions', {
            p_event_slug: pEvent.slug,
            p_types: pEvent.ticketTypes.map((type, index) => ({
              ...(type?.id ? { ticketTypeId: type.id } : { sortOrder: type?.sortOrder ?? index }),
              description: type?.description ?? '',
            })),
            p_actor: `${req.auth.user.id}:${req.auth.user.email}`,
          })

          if (descriptions.error && esRelacionFaltante(descriptions.error)) {
            console.warn(
              '[eventos] `staff_merge_ticket_type_descriptions` no existe en esta base: el evento se guardó sin las descripciones de entrada. Aplicá la migración 20261122100000_ticket_type_description_and_validity.sql.',
            )
          } else {
            assertSupabaseResult(
              descriptions,
              'No se pudieron guardar las descripciones de las entradas.',
            )
          }

          const credenciales = await client.rpc('staff_merge_ticket_type_credentials', {
            p_event_slug: pEvent.slug,
            p_credentials: buildTicketCredentialsPayload(pEvent.ticketTypes),
          })

          // Mismo criterio que la lectura: sin la migración aplicada, el evento
          // se guarda igual y lo único que no persiste son las credenciales. Un
          // guardado de evento no puede fallar entero por una subpestaña.
          if (credenciales.error && esRelacionFaltante(credenciales.error)) {
            console.warn(
              '[eventos] `staff_merge_ticket_type_credentials` no existe en esta base: el evento se guardó sin las credenciales de entrada. Aplicá la migración 20261107100000_ticket_credential_classes.sql.',
            )
          } else {
            assertSupabaseResult(
              credenciales,
              'No se pudieron guardar las credenciales de las entradas.',
            )
          }

          const validity = await client.rpc('staff_merge_ticket_type_validity', {
            p_event_slug: pEvent.slug,
            p_types: pEvent.ticketTypes.map((type, index) => ({
              ...(type?.id ? { ticketTypeId: type.id } : { sortOrder: type?.sortOrder ?? index }),
              validFrom: type?.validFrom || null,
              validUntil: type?.validUntil || null,
              validityMode: type?.validityMode ?? null,
              validityDurationMinutes: type?.validityDurationMinutes ?? null,
              accessUsageMode: type?.accessUsageMode ?? null,
            })),
            p_actor: `${req.auth.user.id}:${req.auth.user.email}`,
          })

          if (validity.error && esRelacionFaltante(validity.error)) {
            console.warn(
              '[eventos] `staff_merge_ticket_type_validity` no existe en esta base: aplicá la migración de vigencia personalizable de QR.',
            )
          } else {
            assertSupabaseResult(validity, 'No se pudo guardar la vigencia de los QR.')
          }

          // Una base todavía en la migración anterior entiende las fechas,
          // pero ignora los campos extra del JSON. Para no guardar en silencio
          // una duración relativa como si fueran jornadas, exigir la función
          // nueva cuando se elige este modo.
          if (
            pEvent.ticketTypes.some((type) =>
              [
                TICKET_QR_VALIDITY_MODE.FROM_PAYMENT,
                TICKET_QR_VALIDITY_MODE.FROM_FIRST_SCAN,
              ].includes(type?.validityMode),
            )
          ) {
            const relativePolicy = await client.rpc('staff_merge_ticket_type_validity_policy', {
              p_event_slug: pEvent.slug,
              p_types: pEvent.ticketTypes.map((type, index) => ({
                ...(type?.id ? { ticketTypeId: type.id } : { sortOrder: type?.sortOrder ?? index }),
                validityMode: type?.validityMode ?? null,
                validityDurationMinutes: type?.validityDurationMinutes ?? null,
              })),
              p_actor: `${req.auth.user.id}:${req.auth.user.email}`,
            })
            if (relativePolicy.error && esRelacionFaltante(relativePolicy.error)) {
              throw new HttpError(
                503,
                'La vigencia desde acreditación requiere aplicar la migración de políticas QR.',
              )
            }
            assertSupabaseResult(
              relativePolicy,
              'No se pudo guardar la política de vigencia desde acreditación.',
            )
          }

          const accessPolicy = await client.rpc('staff_merge_ticket_type_access_policy', {
            p_event_slug: pEvent.slug,
            p_types: pEvent.ticketTypes.map((type, index) => ({
              ...(type?.id ? { ticketTypeId: type.id } : { sortOrder: type?.sortOrder ?? index }),
              accessUsageMode: type?.accessUsageMode ?? TICKET_ACCESS_USAGE_MODE.ONCE_TOTAL,
            })),
            p_actor: `${req.auth.user.id}:${req.auth.user.email}`,
          })
          if (accessPolicy.error && esRelacionFaltante(accessPolicy.error)) {
            throw new HttpError(
              503,
              'La política de acceso por tipo requiere aplicar la migración de entradas unívocas.',
            )
          }
          assertSupabaseResult(
            accessPolicy,
            'No se pudo guardar la política de acceso de las entradas.',
          )
        }

        const events = await readEvents(client)
        const event = events.find((candidate) => candidate.id === savedEvent.id)
        if (!event) {
          throw new HttpError(503, 'El evento se guardó, pero no se pudo volver a leer.')
        }

        res.status(mode === 'created' ? 201 : 200).json({ event, events, mode, warnings })
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * Habilitar, deshabilitar y cambiar el estado público de un evento. Es el
   * mismo permiso que editar el evento, pero sin reescribirlo entero: el upsert
   * recrea días y tipos de entrada en cada pasada, y para prender o apagar un
   * evento eso es un efecto colateral que no queremos.
   *
   * Devuelve la colección completa porque el panel mantiene la lista en memoria
   * y una fila desincronizada acá se nota enseguida (la barra de ocupación y el
   * badge salen del mismo objeto).
   */
  router.post(
    '/:eventSlug/state',
    ...editGuard,
    staffLimiter,
    validateBody(eventStateSchema),
    async (req, res, next) => {
      try {
        const slug = parseEventSlug(req.params.eventSlug)
        const client = requireSupabaseClient(getSupabaseAdmin())
        const result = assertSupabaseResult(
          await client.rpc('staff_set_event_state', {
            p_event_slug: slug,
            p_status: req.validatedBody.status ?? null,
            p_published: req.validatedBody.published ?? null,
            p_requires_membership: req.validatedBody.requiresMembership ?? null,
            p_actor: `${req.auth.user.id}:${req.auth.user.email}`,
            p_capacity_progress_public: req.validatedBody.capacityProgressPublic ?? null,
          }),
          'No se pudo cambiar el estado del evento.',
        )

        const events = await readEvents(client)
        const event = events.find((candidate) => candidate.id === result.event?.id)
        if (!event) {
          throw new HttpError(503, 'El estado se guardó, pero no se pudo volver a leer.')
        }

        res.json({ event, events, statusOverridden: result.statusOverridden === true })
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * Logo / foto del evento. Son dos pasos y ninguno reescribe el evento:
   *
   *   1. `logo/upload-url`: la API elige la ruta (`<eventId>/<timestamp>.<ext>`) y
   *      devuelve una URL firmada; el navegador sube directo a Storage.
   *   2. `PATCH logo`: guarda la ruta en `events.logo_path` (o la borra con `null`).
   *
   * Solo toca `logo_path` y NO bumpea `updated_at`: es el token de concurrencia
   * del editor, y cambiar la imagen mientras alguien tiene el formulario abierto
   * no puede convertir su próximo guardado en un 409.
   */
  router.post(
    '/:eventSlug/logo/upload-url',
    ...editGuard,
    staffLimiter,
    validateBody(logoUploadSchema),
    async (req, res, next) => {
      try {
        const slug = parseEventSlug(req.params.eventSlug)
        const client = requireSupabaseClient(getSupabaseAdmin())
        const found = assertSupabaseResult(
          await client.from('events').select('id').eq('slug', slug).maybeSingle(),
          'No se pudo leer el evento.',
        )
        if (!found) throw new HttpError(404, 'El evento no existe.')

        const extension = EVENT_LOGO_EXTENSIONS[req.validatedBody.contentType]
        const path = `${found.id}/${Date.now()}.${extension}`
        const signed = assertSupabaseResult(
          await client.storage.from(EVENT_LOGO_BUCKET).createSignedUploadUrl(path),
          'No se pudo preparar la carga de la imagen.',
        )
        res.json({ path, token: signed.token, url: eventLogoPublicUrl(client, path) })
      } catch (error) {
        next(error)
      }
    },
  )

  router.patch(
    '/:eventSlug/logo',
    ...editGuard,
    staffLimiter,
    validateBody(logoSetSchema),
    async (req, res, next) => {
      try {
        const slug = parseEventSlug(req.params.eventSlug)
        const { path } = req.validatedBody
        const client = requireSupabaseClient(getSupabaseAdmin())
        const found = assertSupabaseResult(
          await client.from('events').select('id, logo_path').eq('slug', slug).maybeSingle(),
          'No se pudo leer el evento.',
        )
        if (!found) throw new HttpError(404, 'El evento no existe.')
        // Solo rutas emitidas para este evento: el cliente no puede apuntar el
        // logo a un archivo de otro evento ni a otra carpeta del bucket.
        if (path && (!path.startsWith(`${found.id}/`) || path.includes('..'))) {
          throw new HttpError(400, 'La imagen no corresponde a este evento.')
        }

        assertSupabaseResult(
          await client.from('events').update({ logo_path: path }).eq('id', found.id),
          'No se pudo guardar el logo.',
        )

        // La imagen anterior queda huérfana: se limpia sin frenar la respuesta.
        if (found.logo_path && found.logo_path !== path) {
          const removal = await client.storage.from(EVENT_LOGO_BUCKET).remove([found.logo_path])
          if (removal.error) {
            console.warn(`No se pudo borrar el logo anterior de ${slug}:`, removal.error.message)
          }
        }

        const events = await readEvents(client)
        const event = events.find((candidate) => candidate.id === found.id)
        if (!event) throw new HttpError(503, 'El logo se guardó, pero no se pudo volver a leer.')
        res.json({ event, events })
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * Impacto del borrado, sin borrar nada: cuántas inscripciones, entradas,
   * órdenes y acreditaciones se lleva puestas el evento. El panel lo pide al
   * abrir la confirmación para que el operador decida sobre números reales y
   * no sobre "esto elimina todo".
   *
   * `requiresForce` en true es la señal de que el evento ya movió plata o
   * gente: ahí el panel exige escribir el identificador antes de confirmar.
   */
  router.get('/:eventSlug/delete-impact', ...deleteGuard, staffLimiter, async (req, res, next) => {
    try {
      const slug = parseEventSlug(req.params.eventSlug)
      const client = requireSupabaseClient(getSupabaseAdmin())
      const impact = assertSupabaseResult(
        await client.rpc('delete_event', {
          p_event_slug: slug,
          p_actor: `${req.auth.user.id}:${req.auth.user.email}`,
          p_force: false,
          p_dry_run: true,
        }),
        'No se pudo calcular el impacto del borrado.',
      )
      res.json({ impact })
    } catch (error) {
      next(error)
    }
  })

  /**
   * Borrado definitivo del evento y todo lo que cuelga de él. Exige
   * admin.events.delete: es irreversible y se lleva inscripciones, entradas y acreditaciones.
   *
   * La cascada y la auditoría viven en la RPC delete_event
   * (20260815110000_event_hard_delete.sql). Acá queda lo que SQL no alcanza:
   * los comprobantes en storage y las cuentas de puerta, que viven en Prisma.
   *
   * `?force=true` es el consentimiento explícito para eventos con actividad
   * real; sin él la RPC responde 409 y el panel escala la confirmación.
   */
  router.delete('/:eventSlug', ...deleteGuard, staffLimiter, async (req, res, next) => {
    try {
      const slug = parseEventSlug(req.params.eventSlug)
      const client = requireSupabaseClient(getSupabaseAdmin())
      // Se lee antes: después del borrado la fila ya no existe. Es best-effort:
      // una base sin la columna (migración pendiente) no puede frenar el borrado.
      let logoPath = null
      try {
        const logoRow = await client
          .from('events')
          .select('logo_path')
          .eq('slug', slug)
          .maybeSingle()
        logoPath = logoRow?.data?.logo_path ?? null
      } catch {
        logoPath = null
      }
      const deletedEvent = assertSupabaseResult(
        await client.rpc('delete_event', {
          p_event_slug: slug,
          p_actor: `${req.auth.user.id}:${req.auth.user.email}`,
          p_force: req.query.force === 'true',
          p_dry_run: false,
        }),
        'No se pudo eliminar el evento.',
      )

      await removeTicketProofs(client, deletedEvent?.proofOrderIds)
      if (logoPath) {
        const removal = await client.storage.from(EVENT_LOGO_BUCKET).remove([logoPath])
        if (removal?.error) {
          console.warn(`No se pudo borrar el logo de ${slug}:`, removal.error.message)
        }
      }

      // Las credenciales de puerta quedarían apuntando a un evento inexistente:
      // el job de ciclo de vida las trata como huérfanas y las purga igual, pero
      // esperar a la próxima corrida deja una ventana en la que la credencial
      // firmada sigue existiendo.
      const securityUsers = await getPrisma().user.deleteMany({
        where: { role: SECURITY_ROLE, eventId: deletedEvent.id },
      })

      const events = await readEvents(client)
      res.json({
        deletedEvent: { ...deletedEvent, securityUsers: securityUsers?.count ?? 0 },
        events,
      })
    } catch (error) {
      next(error)
    }
  })

  /**
   * Grilla del evento: días, tandas y cuántos atletas hay en cada una. El
   * conteo es lo que hace usable la asignación masiva -- sin él no se ve si una
   * tanda quedó con 4 atletas o con 40.
   */
  router.get(
    '/:eventSlug/schedule',
    ...registrationsViewGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const slug = parseEventSlug(req.params.eventSlug)
        const client = requireSupabaseClient(getSupabaseAdmin())
        const schedule = assertSupabaseResult(
          await client.rpc('staff_get_event_schedule', { p_event_slug: slug }),
          'No se pudo leer la grilla del evento.',
        )
        res.json({ schedule })
      } catch (error) {
        next(error)
      }
    },
  )

  /** Alta/edición de tandas. Reemplaza el set completo del evento. */
  router.post(
    '/:eventSlug/sessions',
    ...editGuard,
    staffLimiter,
    validateBody(eventSessionsSchema),
    async (req, res, next) => {
      try {
        const slug = parseEventSlug(req.params.eventSlug)
        const client = requireSupabaseClient(getSupabaseAdmin())
        const schedule = assertSupabaseResult(
          await client.rpc('staff_save_event_sessions', {
            p_event_slug: slug,
            p_sessions: req.validatedBody.sessions,
            p_actor: `${req.auth.user.id}:${req.auth.user.email}`,
          }),
          'No se pudieron guardar las tandas.',
        )
        res.json({ schedule })
      } catch (error) {
        next(error)
      }
    },
  )

  /** Plantillas de grilla de la organización del evento. */
  router.get(
    '/:eventSlug/grid-templates',
    ...registrationsViewGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const slug = parseEventSlug(req.params.eventSlug)
        const client = requireSupabaseClient(getSupabaseAdmin())
        const templates = assertSupabaseResult(
          await client.rpc('staff_list_grid_templates', { p_event_slug: slug }),
          'No se pudieron leer las plantillas de grilla.',
        )
        res.json({ templates })
      } catch (error) {
        next(error)
      }
    },
  )

  /** Guarda una plantilla; con un nombre existente la pisa. */
  router.post(
    '/:eventSlug/grid-templates',
    ...editGuard,
    staffLimiter,
    validateBody(gridTemplateSchema),
    async (req, res, next) => {
      try {
        const slug = parseEventSlug(req.params.eventSlug)
        const client = requireSupabaseClient(getSupabaseAdmin())
        const templates = assertSupabaseResult(
          await client.rpc('staff_save_grid_template', {
            p_event_slug: slug,
            p_name: req.validatedBody.name,
            p_config: req.validatedBody.config,
            p_actor: `${req.auth.user.id}:${req.auth.user.email}`,
          }),
          'No se pudo guardar la plantilla.',
        )
        res.json({ templates })
      } catch (error) {
        next(error)
      }
    },
  )

  router.delete(
    '/:eventSlug/grid-templates/:templateId',
    ...editGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const slug = parseEventSlug(req.params.eventSlug)
        const templateId = z.string().uuid().safeParse(req.params.templateId)
        if (!templateId.success) {
          res.status(400).json({ error: 'La plantilla indicada no es válida.' })
          return
        }
        const client = requireSupabaseClient(getSupabaseAdmin())
        const templates = assertSupabaseResult(
          await client.rpc('staff_delete_grid_template', {
            p_event_slug: slug,
            p_template_id: templateId.data,
            p_actor: `${req.auth.user.id}:${req.auth.user.email}`,
          }),
          'No se pudo borrar la plantilla.',
        )
        res.json({ templates })
      } catch (error) {
        next(error)
      }
    },
  )

  /** Publica o retira la grilla del sitio oficial. Arranca apagada. */
  router.post(
    '/:eventSlug/schedule-public',
    ...editGuard,
    staffLimiter,
    validateBody(eventSchedulePublicSchema),
    async (req, res, next) => {
      try {
        const slug = parseEventSlug(req.params.eventSlug)
        const client = requireSupabaseClient(getSupabaseAdmin())
        const result = assertSupabaseResult(
          await client.rpc('staff_set_event_schedule_public', {
            p_event_slug: slug,
            p_public: req.validatedBody.public,
            p_actor: `${req.auth.user.id}:${req.auth.user.email}`,
          }),
          'No se pudo cambiar la visibilidad de la grilla.',
        )
        res.json(result)
      } catch (error) {
        next(error)
      }
    },
  )

  /** Tablados del evento (nombre editable). Reemplaza el set completo. */
  router.post(
    '/:eventSlug/platforms',
    ...editGuard,
    staffLimiter,
    validateBody(eventPlatformsSchema),
    async (req, res, next) => {
      try {
        const slug = parseEventSlug(req.params.eventSlug)
        const client = requireSupabaseClient(getSupabaseAdmin())
        const schedule = assertSupabaseResult(
          await client.rpc('staff_save_event_platforms', {
            p_event_slug: slug,
            p_platforms: req.validatedBody.platforms,
            p_actor: `${req.auth.user.id}:${req.auth.user.email}`,
          }),
          'No se pudieron guardar los tablados.',
        )
        res.json({ schedule })
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * Tablero de armado de grilla: días, tandas con su roster completo y la
   * bolsa de inscriptos sin ubicar. Es lo que alimenta la sección Grilla.
   */
  router.get(
    '/:eventSlug/board',
    ...registrationsViewGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const slug = parseEventSlug(req.params.eventSlug)
        const client = requireSupabaseClient(getSupabaseAdmin())
        const board = assertSupabaseResult(
          await client.rpc('staff_get_event_board', { p_event_slug: slug }),
          'No se pudo leer el tablero del evento.',
        )
        res.json({ board })
      } catch (error) {
        next(error)
      }
    },
  )

  /** Reparto sugerido: llena las tandas de un día en orden de competencia. */
  router.post(
    '/:eventSlug/schedule/autofill',
    ...registrationsEditGuard,
    staffLimiter,
    validateBody(autofillSchema),
    async (req, res, next) => {
      try {
        const slug = parseEventSlug(req.params.eventSlug)
        const client = requireSupabaseClient(getSupabaseAdmin())
        const result = assertSupabaseResult(
          await client.rpc('staff_autofill_event_day', {
            p_event_slug: slug,
            p_day_index: req.validatedBody.dayIndex,
            p_max_per_session: req.validatedBody.maxPerSession,
            p_actor: `${req.auth.user.id}:${req.auth.user.email}`,
          }),
          'No se pudo repartir a los atletas.',
        )
        res.json(result)
      } catch (error) {
        next(error)
      }
    },
  )

  /**
   * Asignación masiva: se filtra en el panel (por ejemplo, todas las Open Raw),
   * se selecciona y se manda el lote entero al mismo día/tanda.
   */
  router.post(
    '/:eventSlug/registrations/schedule',
    ...registrationsEditGuard,
    staffLimiter,
    validateBody(assignScheduleSchema),
    async (req, res, next) => {
      try {
        const slug = parseEventSlug(req.params.eventSlug)
        const client = requireSupabaseClient(getSupabaseAdmin())
        const result = assertSupabaseResult(
          await client.rpc('staff_assign_registration_schedule', {
            p_event_slug: slug,
            p_registration_ids: req.validatedBody.registrationIds,
            p_day_index: req.validatedBody.dayIndex,
            p_session_id: req.validatedBody.sessionId,
            p_actor: `${req.auth.user.id}:${req.auth.user.email}`,
          }),
          'No se pudo asignar la grilla.',
        )
        res.json(result)
      } catch (error) {
        next(error)
      }
    },
  )

  return router
}
