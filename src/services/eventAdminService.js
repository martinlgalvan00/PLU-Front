import { normalizeWeighInWindows } from '../lib/weighInWindows.js'
import {
  emptyEventLanding,
  eventLandingIsPublic,
  eventLandingFromEvent,
  landingPayloadForMerge,
  normalizeEventLanding,
  syncLandingSlotsFromPublicCopy,
} from '../lib/eventLanding.js'
import { withLandingBlockImageUrls } from '../lib/eventLandingLayout.js'
import { normalizeEventPublicCopy } from '../lib/eventPublicSurface.js'
import {
  DEFAULT_EVENT_PUBLIC_SURFACE,
  normalizeEventPublicSurface,
} from '../lib/eventPublicSurface.js'
import {
  DEFAULT_EVENT_PRICING,
  isComboOfferLive,
  normalizeEventPricingInput,
  resolveLiveComboOffer,
} from '../lib/eventPricing.js'
import { UPCOMING_EVENTS } from '../lib/events.js'
import { isRegistrationOpen } from '../lib/status.js'
import { hiddenLandingTakesRegistrations } from '../../shared/registrationSaleState.js'
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js'
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from '../lib/api.js'
import { compressImageFile } from '../lib/compressImageFile.js'
import { removeImageBackground } from '../lib/removeImageBackground.js'
import { normalizeTicketCredentials } from '../lib/ticketCredentials.js'
import { normalizeEventPaymentChannelOverrides } from '../lib/eventPaymentChannels.js'
import { externalFormFromRules, normalizeExternalForm } from '../lib/eventExternalForm.js'
import {
  normalizeEventOffering,
  offeringForStorage,
  offeringFromRules,
} from '../../shared/eventOffering.js'
import {
  eventModulesForStorage,
  eventModulesFromRules,
  isStoredEventModuleOn,
  normalizeEventModules,
  normalizeEventPaymentPolicy,
  paymentPolicyForStorage,
  paymentPolicyFromRules,
} from '../../shared/eventModules.js'
import { normalizeTicketTypePaymentChannels } from '../lib/ticketTypePaymentChannels.js'
import { catalogPriceFromRow, normalizeTicketTypePrices } from '../lib/ticketTypePrices.js'
import { TICKET_ACCESS_USAGE_MODE, TICKET_QR_VALIDITY_MODE } from '../lib/ticketValidityPolicy.js'

const DEFAULT_SLOTS = 80

// Mismo set que create_competition_registration_v2 usa para bloquear cupo
// (supabase/migrations/20260717140000_plu_v26_1_division_category_lexicon.sql).
// Contar canceladas/borradores acá mostraría el evento lleno mientras el RPC
// todavía acepta inscripciones.
const ACTIVE_REGISTRATION_STATUSES = ['pendiente_pago', 'pagada', 'confirmada']

function countActiveRegistrations(rows) {
  return rows.filter((row) => ACTIVE_REGISTRATION_STATUSES.includes(row?.status)).length
}

function slugify(title, dateISO) {
  const base = String(title ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const year = dateISO?.slice(0, 4) ?? '2026'
  return `${base || 'evento'}-${year}`
}

function formatEventDate(dateISO) {
  if (!dateISO) return '—'
  const date = new Date(`${dateISO}T12:00:00`)
  // Según el motor, es-AR da "12 dic" o "12-dic". `EventCard` separa día y mes
  // por espacio, así que el guion partía mal la fecha en dos líneas.
  return date
    .toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
    .replace('.', '')
    .replace('-', ' ')
}

function toDateTimeLocal(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16)

  const pad = (part) => String(part).padStart(2, '0')
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join('T')
}

function clonePricing(pricing) {
  const normalized = normalizeEventPricingInput(pricing)
  return {
    ...normalized,
    ticketAddons: (normalized.ticketAddons ?? []).map((addon) => ({ ...addon })),
  }
}

export function createAdminEventDraft() {
  return {
    ...ADMIN_EVENT_FORM_DEFAULT,
    pricing: clonePricing(ADMIN_EVENT_FORM_DEFAULT.pricing),
    eventDays: [],
    ticketTypes: [],
    weighInWindows: [],
  }
}

export function buildAdminEventDraft(event) {
  if (!event) return createAdminEventDraft()

  return {
    ...createAdminEventDraft(),
    id: event.id,
    expectedUpdatedAt: event.updatedAt ?? '',
    slug: event.slug,
    title: event.title ?? '',
    description: event.description ?? '',
    dateISO: event.dateISO ?? event.startsAt?.slice(0, 10) ?? '',
    venue: event.venue ?? '',
    venueAddress: event.venueAddress ?? '',
    location: event.location ?? '',
    status: event.status ?? 'proximamente',
    featured: Boolean(event.featured),
    slots: event.slots ?? DEFAULT_SLOTS,
    ticketCapacity: event.ticketCapacity ?? '',
    pricing: clonePricing(event.pricing),
    startsAt: toDateTimeLocal(event.startsAt),
    endsAt: toDateTimeLocal(event.endsAt),
    registrationOpensAt: toDateTimeLocal(event.registrationOpensAt),
    registrationClosesAt: toDateTimeLocal(event.registrationClosesAt),
    ticketSalesOpensAt: toDateTimeLocal(event.ticketSalesOpensAt),
    ticketSalesClosesAt: toDateTimeLocal(event.ticketSalesClosesAt),
    eventDays: (event.eventDays ?? []).map((day) => ({ ...day })),
    ticketTypes: (event.ticketTypes ?? []).map((type) => ({
      ...type,
      // Mismo tratamiento que las fechas del evento: los `datetime-local` del
      // editor no entienden ISO con zona, y sin esto la ventana del tipo se
      // veía vacía y se borraba al primer guardado.
      salesOpensAt: toDateTimeLocal(type.salesOpensAt),
      salesClosesAt: toDateTimeLocal(type.salesClosesAt),
      validFrom: toDateTimeLocal(type.validFrom),
      validUntil: toDateTimeLocal(type.validUntil),
      validityMode:
        type.validityMode ??
        (type.validFrom || type.validUntil
          ? TICKET_QR_VALIDITY_MODE.FIXED_WINDOW
          : TICKET_QR_VALIDITY_MODE.EVENT_DAYS),
      validityDurationMinutes: type.validityDurationMinutes ?? null,
      dayIndexes: [...(type.dayIndexes ?? [])],
      includedAddonIds: [...(type.includedAddonIds ?? [])],
      // Copia propia por el mismo motivo que las credenciales: el editor lo
      // muta por canal y compartir la referencia rompía el "sin guardar".
      paymentChannels: type.paymentChannels ? { ...type.paymentChannels } : null,
      // Copia profunda: el editor muta credenciales por índice, y compartir la
      // referencia con el evento original rompía la comparación de "sin
      // guardar" y el descarte.
      credentials: normalizeTicketCredentials(type.credentials).map((credential) => ({
        ...credential,
        zoneScopes: [...credential.zoneScopes],
      })),
    })),
    weighInWindows: normalizeWeighInWindows(event.weighInWindows),
    publicSurface: normalizeEventPublicSurface(event.publicSurface),
    publicCopy: normalizeEventPublicCopy(event.publicCopy),
    landing: eventLandingFromEvent(event),
    liveStreamUrl: event.liveStreamUrl ?? '',
    liveStreamProvider: event.liveStreamProvider ?? 'youtube',
    liveStatus: event.liveStatus ?? 'offline',
    published: event.published === true,
    requiresMembership: event.requiresMembership !== false,
    capacityProgressPublic: event.capacityProgressPublic !== false,
    capacityTotalPublic: event.capacityTotalPublic !== false,
    paymentChannelOverrides: normalizeEventPaymentChannelOverrides(event.paymentChannelOverrides),
    bankTransfer: {
      alias: event.bankTransfer?.alias ?? '',
      cbu: event.bankTransfer?.cbu ?? '',
      holder: event.bankTransfer?.holder ?? '',
      cuit: event.bankTransfer?.cuit ?? '',
      bankName: event.bankTransfer?.bankName ?? '',
    },
    bankTransferProfileId: event.bankTransferProfileId ?? null,
    mercadoPagoProfileId: event.mercadoPagoProfileId ?? null,
    mercadoPagoReadiness: event.mercadoPagoReadiness ?? null,
    salesIntent: event.salesIntent === 'announce' ? 'announce' : 'charge',
    cashPayment: {
      place: event.cashPayment?.place ?? '',
      notes: event.cashPayment?.notes ?? '',
      address: event.cashPayment?.address ?? '',
      hours: event.cashPayment?.hours ?? '',
      contact: event.cashPayment?.contact ?? '',
    },
    externalForm: normalizeExternalForm(event.externalForm),
    offering: normalizeEventOffering(event.offering),
    modules: normalizeEventModules(event.modules),
    paymentPolicy: normalizeEventPaymentPolicy(event.paymentPolicy),
  }
}

/**
 * `startsAt` es la única fuente de fecha del evento. `dateISO` sigue existiendo
 * porque alimenta slug, orden del listado y preview, pero pasa a derivarse acá
 * en vez de ser un input aparte que el admin podía dejar contradiciendo al
 * inicio real (y que se sobrescribía solo al recargar).
 */
export function withEventStart(draft, startsAt) {
  return { ...draft, startsAt, dateISO: startsAt ? startsAt.slice(0, 10) : '' }
}

export function mapDraftToPreviewEvent(draft, sourceEvent = null) {
  const title = draft.title?.trim() || 'Título del evento'
  const dateISO = draft.dateISO || sourceEvent?.dateISO || ''
  const slots = Math.max(1, Number(draft.slots) || sourceEvent?.slots || DEFAULT_SLOTS)

  return {
    id: draft.id ?? sourceEvent?.id ?? 'preview',
    title,
    description: draft.description?.trim() ?? sourceEvent?.description ?? '',
    date: dateISO ? formatEventDate(dateISO) : '—',
    dateISO,
    venue: draft.venue?.trim() || 'Sede del evento',
    venueAddress: draft.venueAddress?.trim() ?? '',
    location: draft.location?.trim() || 'Ciudad',
    status: draft.status || 'proximamente',
    featured: Boolean(draft.featured),
    slots,
    registered: sourceEvent?.registered ?? 0,
    published: draft.published === true,
    requiresMembership: draft.requiresMembership !== false,
    publicCopy: normalizeEventPublicCopy(draft.publicCopy ?? sourceEvent?.publicCopy),
    landing: normalizeEventLanding(draft.landing ?? sourceEvent?.landing, {
      publicCopy: draft.publicCopy ?? sourceEvent?.publicCopy,
      slug: draft.slug ?? sourceEvent?.slug,
    }),
    slug:
      draft.slug ??
      sourceEvent?.slug ??
      (title && dateISO ? slugify(title, dateISO) : 'evento-preview'),
  }
}

function parseLocalDateTime(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export const OPEN_REGISTRATION_STATUSES = ['inscripcion_abierta', 'cupos_limitados']
const CLOSED_REGISTRATION_STATUSES = ['cerrado', 'finalizado']

/**
 * Contradicciones entre el estado público —que el admin elige a mano— y la
 * realidad del evento: ventanas de fecha vencidas o cupo lleno. El backend ya
 * rechaza estas altas (create_competition_registration_v2 / create_ticket_order_v2),
 * pero el sitio público sigue invitando y el atleta se entera recién al final.
 *
 * Solo advierte: no corrige el dato ni bloquea el guardado. El admin manda.
 * Devuelve códigos; el copy vive en `admin.eventEditor.consistency.*`.
 */
export function getEventConsistencyWarnings(draft, sourceEvent = null, now = new Date()) {
  if (!draft) return []

  const warnings = []
  const status = draft.status ?? ''
  const registrationOpensAt = parseLocalDateTime(draft.registrationOpensAt)
  const registrationClosesAt = parseLocalDateTime(draft.registrationClosesAt)
  const ticketSalesClosesAt = parseLocalDateTime(draft.ticketSalesClosesAt)
  const endsAt = parseLocalDateTime(draft.endsAt)
  const registered = sourceEvent?.registered ?? 0
  const slots = Number(draft.slots) || 0

  if (OPEN_REGISTRATION_STATUSES.includes(status)) {
    if (registrationClosesAt && registrationClosesAt < now) {
      warnings.push('registrationClosedButOpenStatus')
    }
    if (registrationOpensAt && registrationOpensAt > now) {
      warnings.push('registrationNotYetOpen')
    }
  }

  if (CLOSED_REGISTRATION_STATUSES.includes(status)) {
    const windowOpen =
      (!registrationOpensAt || registrationOpensAt <= now) &&
      (!registrationClosesAt || registrationClosesAt >= now)
    if (windowOpen && (registrationOpensAt || registrationClosesAt)) {
      warnings.push('registrationOpenButClosedStatus')
    }
  }

  if (status === 'inscripcion_abierta' && slots > 0 && registered >= slots) {
    warnings.push('slotsFullButOpenStatus')
  }

  if (draft.pricing?.ticketsEnabled === true && ticketSalesClosesAt && ticketSalesClosesAt < now) {
    warnings.push('ticketSalesClosedButEnabled')
  }

  if (status === 'finalizado' && endsAt && endsAt > now) {
    warnings.push('finishedButNotEnded')
  }

  return warnings
}

export function getInitialAdminEvents(storedEvents, { allowStoredEvents = true } = {}) {
  const seed = UPCOMING_EVENTS.map((event, index) => ({
    id: `evt-${index + 1}`,
    ...event,
    // Fuera de demo no inventamos "Abre la inscripción": el countdown espera
    // la fecha real del panel (`registration_opens_at` vía /api/events/catalog).
    registrationOpensAt: allowStoredEvents ? (event.registrationOpensAt ?? null) : null,
    createdAt: event.createdAt ?? `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    createdOrder: index + 1,
    slots: event.slots ?? (event.featured ? 120 : DEFAULT_SLOTS),
    registered: event.featured ? 48 : Math.floor(DEFAULT_SLOTS * 0.35),
    price: event.price ?? DEFAULT_EVENT_PRICING.registration,
    currency: event.currency ?? 'ARS',
    pricing: { ...DEFAULT_EVENT_PRICING },
    published: event.published ?? true,
    requiresMembership: event.requiresMembership !== false,
  }))

  // En el runtime conectado, eventos y precios pertenecen a Supabase. Un
  // snapshot viejo de localStorage (por ejemplo Pitbull con price=2) no puede
  // mostrarse ni cotizar mientras llega el fetch remoto. El storage se conserva
  // únicamente para el modo demo, donde sí es la persistencia deliberada.
  const localEvents = allowStoredEvents ? storedEvents : null
  if (!localEvents?.length) return seed

  const seedBySlug = Object.fromEntries(seed.map((event) => [event.slug, event]))
  const merged = localEvents.map((event, index) => ({
    ...(seedBySlug[event.slug] ?? {}),
    ...event,
    createdAt:
      event.createdAt ??
      seedBySlug[event.slug]?.createdAt ??
      `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    createdOrder: event.createdOrder ?? seedBySlug[event.slug]?.createdOrder ?? Date.now() + index,
    published: event.published ?? seedBySlug[event.slug]?.published ?? true,
    requiresMembership:
      event.requiresMembership ?? seedBySlug[event.slug]?.requiresMembership ?? true,
    pricing: normalizeEventPricingInput(event.pricing ?? seedBySlug[event.slug]?.pricing),
  }))

  for (const event of seed) {
    if (!merged.some((item) => item.slug === event.slug)) {
      merged.push(event)
    }
  }

  return merged.sort((a, b) => new Date(a.dateISO) - new Date(b.dateISO))
}

export function eventYearFromIso(dateISO) {
  const year = String(dateISO ?? '').slice(0, 4)
  return /^\d{4}$/.test(year) ? year : ''
}

export function listAdminEventYears(events = []) {
  return [...new Set(events.map((event) => eventYearFromIso(event.dateISO)).filter(Boolean))].sort(
    (left, right) => right.localeCompare(left),
  )
}

export function defaultAdminEventYear(events = []) {
  const upcoming = events.filter((event) => event?.status !== 'finalizado')
  const pool = upcoming.length ? upcoming : events
  const next = [...pool].sort((left, right) =>
    String(left?.dateISO ?? '').localeCompare(String(right?.dateISO ?? '')),
  )[0]
  return eventYearFromIso(next?.dateISO) || listAdminEventYears(events)[0] || ''
}

export function pickLeadAdminEvent(events = []) {
  const upcoming = events.filter((event) => event?.status !== 'finalizado')
  if (!upcoming.length) return null
  const featured = upcoming.filter((event) => event.featured)
  const pool = featured.length ? featured : upcoming
  return (
    [...pool].sort((left, right) =>
      String(left?.dateISO ?? '').localeCompare(String(right?.dateISO ?? '')),
    )[0] ?? null
  )
}

export function filterAdminEvents(events, { query = '', status = 'all', year = '' } = {}) {
  const normalizedQuery = query.trim().toLowerCase()
  const yearKey = year && year !== 'all' ? year : ''

  return events.filter((event) => {
    const statusMatch = status === 'all' || event.status === status
    const yearMatch = !yearKey || eventYearFromIso(event.dateISO) === yearKey
    const title = String(event.title ?? '').toLowerCase()
    const venue = String(event.venue ?? '').toLowerCase()
    const location = String(event.location ?? '').toLowerCase()
    const slug = String(event.slug ?? '').toLowerCase()
    const queryMatch =
      !normalizedQuery ||
      title.includes(normalizedQuery) ||
      venue.includes(normalizedQuery) ||
      location.includes(normalizedQuery) ||
      slug.includes(normalizedQuery)

    return statusMatch && yearMatch && queryMatch
  })
}

export function buildEventAdminStats(events, registrations = []) {
  const active = events.filter((event) => event.status !== 'finalizado').length
  const open = events.filter((event) =>
    ['inscripcion_abierta', 'cupos_limitados'].includes(event.status),
  ).length
  const featured = events.filter((event) => event.featured).length
  const totalRegistered = registrations.length

  return { active, open, featured, totalRegistered }
}

export function createAdminEvent(events, payload) {
  const dateISO = payload.dateISO
  const date = formatEventDate(dateISO)
  const createdAt = new Date().toISOString()
  const featured = Boolean(payload.featured)
  const event = {
    id: `evt-${Date.now()}`,
    title: payload.title.trim(),
    description: payload.description?.trim() ?? '',
    date,
    dateISO,
    venue: payload.venue.trim(),
    location: payload.location.trim(),
    slug: slugify(payload.title, dateISO),
    status: payload.status ?? 'proximamente',
    featured,
    createdAt,
    updatedAt: createdAt,
    createdOrder: Date.now(),
    slots: Number(payload.slots) || DEFAULT_SLOTS,
    ticketCapacity: payload.ticketCapacity ?? '',
    registered: 0,
    pricing: normalizeEventPricingInput(payload.pricing),
    startsAt: payload.startsAt ?? '',
    endsAt: payload.endsAt ?? '',
    registrationOpensAt: payload.registrationOpensAt ?? '',
    registrationClosesAt: payload.registrationClosesAt ?? '',
    ticketSalesOpensAt: payload.ticketSalesOpensAt ?? '',
    ticketSalesClosesAt: payload.ticketSalesClosesAt ?? '',
    eventDays: payload.eventDays ?? [],
    ticketTypes: payload.ticketTypes ?? [],
    weighInWindows: normalizeWeighInWindows(payload.weighInWindows),
    publicSurface: normalizeEventPublicSurface(payload.publicSurface),
    publicCopy: normalizeEventPublicCopy(payload.publicCopy),
    liveStreamUrl: payload.liveStreamUrl ?? '',
    liveStreamProvider: payload.liveStreamProvider ?? 'youtube',
    liveStatus: payload.liveStatus ?? 'offline',
    externalForm: normalizeExternalForm(payload.externalForm),
    offering: normalizeEventOffering(payload.offering),
    modules: normalizeEventModules(payload.modules),
    paymentPolicy: normalizeEventPaymentPolicy(payload.paymentPolicy),
    published: Boolean(payload.published),
    requiresMembership: payload.requiresMembership !== false,
  }

  const siblings = featured ? events.map((item) => ({ ...item, featured: false })) : events

  return {
    event,
    events: [event, ...siblings],
    auditLog: {
      id: `audit-evt-${Date.now()}`,
      action: 'event.created',
      entityType: 'event',
      entityId: event.id,
      actor: 'admin',
      createdAt: new Date().toISOString(),
    },
  }
}

export function updateAdminEvent(events, eventId, payload) {
  let updated = null
  const featured = payload.featured ?? false

  const nextEvents = events.map((event) => {
    if (event.id !== eventId) {
      return featured && event.featured ? { ...event, featured: false } : event
    }

    const dateISO = payload.dateISO ?? event.dateISO
    updated = {
      ...event,
      title: payload.title?.trim() ?? event.title,
      description: payload.description?.trim() ?? event.description ?? '',
      dateISO,
      date: formatEventDate(dateISO),
      venue: payload.venue?.trim() ?? event.venue,
      location: payload.location?.trim() ?? event.location,
      status: payload.status ?? event.status,
      featured: payload.featured ?? event.featured,
      slots: Number(payload.slots) || event.slots,
      ticketCapacity:
        payload.ticketCapacity !== undefined ? payload.ticketCapacity : (event.ticketCapacity ?? ''),
      slug: event.slug ?? slugify(payload.title ?? event.title, dateISO),
      pricing: normalizeEventPricingInput(payload.pricing ?? event.pricing),
      startsAt: payload.startsAt ?? event.startsAt ?? '',
      endsAt: payload.endsAt ?? event.endsAt ?? '',
      registrationOpensAt: payload.registrationOpensAt ?? event.registrationOpensAt ?? '',
      registrationClosesAt: payload.registrationClosesAt ?? event.registrationClosesAt ?? '',
      ticketSalesOpensAt: payload.ticketSalesOpensAt ?? event.ticketSalesOpensAt ?? '',
      ticketSalesClosesAt: payload.ticketSalesClosesAt ?? event.ticketSalesClosesAt ?? '',
      eventDays: payload.eventDays ?? event.eventDays ?? [],
      ticketTypes: payload.ticketTypes ?? event.ticketTypes ?? [],
      weighInWindows: normalizeWeighInWindows(payload.weighInWindows ?? event.weighInWindows),
      publicSurface: normalizeEventPublicSurface(payload.publicSurface ?? event.publicSurface),
      publicCopy: normalizeEventPublicCopy(payload.publicCopy ?? event.publicCopy),
      liveStreamUrl: payload.liveStreamUrl ?? event.liveStreamUrl ?? '',
      liveStreamProvider: payload.liveStreamProvider ?? event.liveStreamProvider ?? 'youtube',
      liveStatus: payload.liveStatus ?? event.liveStatus ?? 'offline',
      externalForm: normalizeExternalForm(payload.externalForm ?? event.externalForm),
      offering: normalizeEventOffering(payload.offering ?? event.offering),
      modules: normalizeEventModules(payload.modules ?? event.modules),
      paymentPolicy: normalizeEventPaymentPolicy(payload.paymentPolicy ?? event.paymentPolicy),
      published: Boolean(payload.published),
      requiresMembership:
        payload.requiresMembership !== undefined
          ? Boolean(payload.requiresMembership)
          : event.requiresMembership !== false,
      updatedAt: new Date().toISOString(),
    }
    return updated
  })

  return {
    event: updated,
    events: nextEvents,
    auditLog: updated
      ? {
          id: `audit-evt-${Date.now()}`,
          action: 'event.updated',
          entityType: 'event',
          entityId: eventId,
          actor: 'admin',
          createdAt: new Date().toISOString(),
        }
      : null,
  }
}

/**
 * Baja del evento en la colección local (demo sin backend). El borrado real lo
 * hace `deleteAdminEventRequest` contra la RPC; esto es solo el espejo en
 * memoria para que la lista no siga mostrando una fila que ya no existe.
 */
export function removeAdminEvent(events, eventId) {
  const event = events.find((item) => item.id === eventId) ?? null

  return {
    event,
    events: event ? events.filter((item) => item.id !== eventId) : events,
    auditLog: event
      ? {
          id: `audit-evt-${Date.now()}`,
          action: 'event.deleted',
          entityType: 'event',
          entityId: eventId,
          actor: 'admin',
          createdAt: new Date().toISOString(),
        }
      : null,
  }
}

export const ADMIN_EVENT_STATUS_OPTIONS = [
  ['all', 'allStatuses'],
  ['proximamente', 'status'],
  ['inscripcion_abierta', 'status'],
  ['cupos_limitados', 'status'],
  ['agotado', 'status'],
  ['cerrado', 'status'],
  ['finalizado', 'status'],
]

/**
 * Estados que el operador puede fijar desde la lista, en orden de ciclo de
 * vida. `agotado` queda afuera a propósito: lo pone y lo saca la base según el
 * cupo (`sync_event_capacity_status`), y ofrecerlo como opción manual invitaría
 * a marcar lleno un evento que todavía acepta gente -- o peor, a "reabrir" uno
 * lleno y que el cambio se revierta solo un segundo después.
 */
export const EVENT_QUICK_STATUS_VALUES = [
  'proximamente',
  'inscripcion_abierta',
  'cupos_limitados',
  'cerrado',
  'finalizado',
]

/** Un evento con cupo definido y todos los lugares tomados. */
export function isEventFull(event) {
  const slots = Number(event?.slots) || 0
  return slots > 0 && (event?.registered ?? 0) >= slots
}

/**
 * Estado operativo de una inscripción pública. El estado del evento, su
 * publicación y la ventana calendaria son tres guards distintos en la RPC;
 * concentrarlos evita que el panel anuncie "abierta" algo que el servidor va
 * a rechazar por fecha o cupo.
 *
 * `now` es inyectable para que esta misma decisión se pueda cubrir sin depender
 * del reloj del navegador en los tests.
 */
export function getEventRegistrationAvailability(event, now = new Date()) {
  const status = event?.status ?? 'proximamente'
  const published = event?.published === true
  const opensAt = event?.registrationOpensAt ? new Date(event.registrationOpensAt) : null
  const closesAt = event?.registrationClosesAt ? new Date(event.registrationClosesAt) : null
  const validOpensAt = opensAt && !Number.isNaN(opensAt.getTime()) ? opensAt : null
  const validClosesAt = closesAt && !Number.isNaN(closesAt.getTime()) ? closesAt : null
  const scheduled = Boolean(validOpensAt && now < validOpensAt)
  const closedByWindow = Boolean(validClosesAt && now > validClosesAt)
  // `agotado` es autoritativo aunque el resumen local todavía no tenga el
  // conteo completo (por ejemplo, durante una recarga del panel).
  const full = status === 'agotado' || isEventFull(event)
  const statusOpen = isRegistrationOpen(status)

  return {
    closedByWindow,
    full,
    isLive: published && statusOpen && !scheduled && !closedByWindow && !full,
    published,
    scheduled,
    statusOpen,
    // La acción rápida no toca fechas: sólo está disponible cuando la ventana
    // ya admite altas. Así no se saltea una apertura programada por error.
    canOpen: !full && !scheduled && !closedByWindow && (!published || !statusOpen),
    canSetUpcoming: !published || status !== 'proximamente',
    opensAt: validOpensAt,
    closesAt: validClosesAt,
  }
}

export const ADMIN_EVENT_FORM_DEFAULT = {
  title: '',
  description: '',
  dateISO: '',
  venue: '',
  venueAddress: '',
  location: '',
  status: 'proximamente',
  featured: false,
  slots: DEFAULT_SLOTS,
  pricing: { ...DEFAULT_EVENT_PRICING },
  // Fase 1 — Supabase (calendario/directo/cupos), ver upsertEventCalendarLiveFields.
  startsAt: '',
  endsAt: '',
  registrationOpensAt: '',
  registrationClosesAt: '',
  ticketSalesOpensAt: '',
  ticketSalesClosesAt: '',
  ticketCapacity: '',
  eventDays: [],
  ticketTypes: [],
  weighInWindows: [],
  publicSurface: { ...DEFAULT_EVENT_PUBLIC_SURFACE },
  publicCopy: {
    publicTitle: '',
    heroLead: '',
    ctaLabel: '',
    inscriptionMark: '',
    inscriptionNote: '',
  },
  landing: emptyEventLanding('meet'),
  liveStreamUrl: '',
  liveStreamProvider: 'youtube',
  liveStatus: 'offline',
  published: false,
  requiresMembership: true,
  // El sitio muestra la ocupación salvo decisión contraria del organizador.
  capacityProgressPublic: true,
  capacityTotalPublic: true,
  paymentChannelOverrides: null,
  bankTransfer: { alias: '', cbu: '', holder: '' },
  bankTransferProfileId: null,
  mercadoPagoProfileId: null,
  mercadoPagoReadiness: null,
  salesIntent: 'charge',
  cashPayment: { place: '', notes: '', address: '', hours: '', contact: '' },
  externalForm: { url: '', label: '' },
  offering: normalizeEventOffering(null),
  modules: normalizeEventModules(null),
  paymentPolicy: normalizeEventPaymentPolicy(null),
}

/** Reconstruye eventDays/ticketTypes desde las filas joineadas de Supabase. */
function mapSupabaseTicketCatalog(row) {
  const eventDays = (row.eventDays ?? [])
    .map((day) => ({
      id: day.id,
      dayIndex: day.day_index ?? day.dayIndex,
      label: day.label,
      date: day.date,
    }))
    .sort((a, b) => a.dayIndex - b.dayIndex)

  const dayIndexById = Object.fromEntries(eventDays.map((day) => [day.id, day.dayIndex]))

  const ticketTypes = (row.ticketTypes ?? [])
    .map((type) => ({
      id: type.id,
      name: type.name,
      description: type.description ?? '',
      price: type.price,
      // USD propio para Wise y ventana propia de venta. Null en cualquiera de
      // los tres = hereda lo del evento (conversión automática / ventana del
      // evento), que es como se comportaba todo el catálogo hasta acá.
      // Snake y camel: si el mapper corre dos veces (o el select ya venía
      // proyectado), mirar sólo `wise_price` reabre el draft vacío y el
      // próximo Guardar borra el monto.
      wisePrice: catalogPriceFromRow(type, 'wise_price', 'wisePrice'),
      // Precio para transferencia/efectivo. Null = cobra igual que `price` en
      // cualquier canal.
      manualPrice: catalogPriceFromRow(type, 'manual_price', 'manualPrice'),
      salesOpensAt: type.sales_opens_at ?? type.salesOpensAt ?? null,
      salesClosesAt: type.sales_closes_at ?? type.salesClosesAt ?? null,
      validFrom: type.valid_from ?? type.validFrom ?? null,
      validUntil: type.valid_until ?? type.validUntil ?? null,
      validityMode:
        type.qr_validity_mode ??
        type.validityMode ??
        ((type.valid_from ?? type.validFrom) || (type.valid_until ?? type.validUntil)
          ? TICKET_QR_VALIDITY_MODE.FIXED_WINDOW
          : TICKET_QR_VALIDITY_MODE.EVENT_DAYS),
      validityDurationMinutes:
        type.qr_validity_duration_minutes ?? type.validityDurationMinutes ?? null,
      accessUsageMode:
        type.access_usage_mode ?? type.accessUsageMode ?? TICKET_ACCESS_USAGE_MODE.ONCE_TOTAL,
      quota: type.quota,
      sortOrder: type.sort_order ?? type.sortOrder,
      active: type.active,
      dayIndexes:
        type.dayIndexes ??
        (type.ticketTypeDays ?? [])
          .map((link) => dayIndexById[link.event_day_id ?? link.eventDayId])
          .filter((value) => value !== undefined),
      includedAddonIds:
        type.includedAddonIds ??
        (type.includedAddons ?? []).map((link) => link.addon_id ?? link.addonId),
      // Medios propios de esta entrada. Null hereda los del evento, que es lo
      // que tienen todas las filas anteriores a la columna.
      paymentChannels: normalizeTicketTypePaymentChannels(
        type.payment_channels ?? type.paymentChannels,
      ),
      // Subcategorías: qué credenciales emite una compra de este tipo. El
      // orden es el de emisión, y la primera es la que lleva el precio.
      credentials: normalizeTicketCredentials(
        [...(type.credentials ?? [])]
          .sort((a, b) => (a.sort_order ?? a.sortOrder ?? 0) - (b.sort_order ?? b.sortOrder ?? 0))
          .map((credential) => ({
            id: credential.id,
            label: credential.label,
            zoneScopes: credential.zone_scopes ?? credential.zoneScopes ?? [],
          })),
      ),
    }))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  return { eventDays, ticketTypes }
}

export function mapSupabaseEventRow(row) {
  const rules = row.rules ?? {}
  const comboOfferRow = Array.isArray(row.comboOffer)
    ? (row.comboOffer[0] ?? null)
    : (row.comboOffer ?? row.combo_offer ?? null)
  const { eventDays, ticketTypes } = mapSupabaseTicketCatalog(row)
  const registrationRows = row.eventRegistrations ?? row.event_registrations
  const embeddedRegistrationCount = Array.isArray(registrationRows)
    ? registrationRows.find((item) => Number.isFinite(Number(item?.count)))?.count
    : null
  const registrationCount = Number.isFinite(Number(embeddedRegistrationCount))
    ? Number(embeddedRegistrationCount)
    : Array.isArray(registrationRows)
      ? countActiveRegistrations(registrationRows)
      : (row.registrationCount ?? row.registration_count ?? 0)

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description ?? '',
    venue: row.venue,
    // Calle y número (20270102110000): Google Maps y Waze.
    venueAddress: row.venue_address ?? '',
    location: row.location,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    registrationOpensAt: row.registration_opens_at,
    registrationClosesAt: row.registration_closes_at,
    ticketSalesOpensAt: row.ticket_sales_opens_at,
    ticketSalesClosesAt: row.ticket_sales_closes_at,
    capacity: row.capacity,
    status: row.status,
    rosterFrozenAt: row.roster_frozen_at ?? row.rosterFrozenAt ?? null,
    published: row.published,
    requiresMembership: row.requires_membership !== false,
    capacityProgressPublic: row.capacity_progress_public !== false,
    capacityTotalPublic: row.capacity_total_public !== false,
    logoPath: row.logo_path ?? null,
    logoUrl: row.logo_url ?? null,
    heroImageUrl: row.hero_image_url ?? null,
    paymentChannelOverrides: normalizeEventPaymentChannelOverrides(row.payment_channel_overrides),
    bankTransfer: {
      alias: row.bank_transfer_alias ?? '',
      cbu: row.bank_transfer_cbu ?? '',
      holder: row.bank_transfer_holder ?? '',
    },
    bankTransferProfileId: row.bank_transfer_profile_id ?? null,
    mercadoPagoProfileId: row.mercado_pago_profile_id ?? null,
    mercadoPagoReadiness: row.mercado_pago_readiness
      ? {
          destination: row.mercado_pago_readiness.destination ?? 'platform',
          profileId: row.mercado_pago_readiness.profileId ?? null,
          profileName: row.mercado_pago_readiness.profileName ?? null,
          connectionStatus: row.mercado_pago_readiness.connectionStatus ?? null,
          active: row.mercado_pago_readiness.active ?? null,
        }
      : null,
    salesIntent: row.rules?.salesIntent === 'announce' ? 'announce' : 'charge',
    cashPayment: {
      place: row.cash_payment_place ?? '',
      notes: row.cash_payment_notes ?? '',
      address: row.cash_payment_address ?? '',
      hours: row.cash_payment_hours ?? '',
      contact: row.cash_payment_contact ?? '',
    },
    externalForm: externalFormFromRules(rules),
    offering: offeringFromRules(rules),
    modules: eventModulesFromRules(rules),
    paymentPolicy: paymentPolicyFromRules(rules),
    comboOffer: comboOfferRow
      ? {
          id: comboOfferRow.id,
          membershipPlanId: comboOfferRow.membership_plan_id,
          price: Number(comboOfferRow.price),
          manualPrice:
            comboOfferRow.manual_price != null ? Number(comboOfferRow.manual_price) : null,
          currency: comboOfferRow.currency,
          active: comboOfferRow.active === true,
          financed: comboOfferRow.financed === true,
          // Sin audiencia, un combo restringido se interpretaba como público
          // en Home, Afiliación y el checkout. Es una propiedad de acceso, no
          // sólo un dato del panel: tiene que sobrevivir la normalización.
          audience: ['code', 'private'].includes(comboOfferRow.audience)
            ? comboOfferRow.audience
            : 'public',
          startsAt: comboOfferRow.starts_at ?? null,
          endsAt: comboOfferRow.ends_at ?? null,
          // El fallback de `fetchPublishedEvents` a Supabase directo no pasa por
          // `sanitizePublicCatalogEvent`: sin este campo, `isComboOfferLive`
          // no podía distinguir un combo archivado (historia contable) de uno
          // vigente, y lo volvía a anunciar con su precio congelado.
          archivedAt: comboOfferRow.archived_at ?? null,
        }
      : null,
    price: row.price,
    manualPrice: row.manual_price != null ? Number(row.manual_price) : null,
    wisePrice: row.wise_price != null ? Number(row.wise_price) : null,
    // Cambio de precio programado (20260929100000): el público lo necesita para
    // anunciar el aumento que viene, y resolveEventPricing para no mostrar el
    // precio viejo en el minuto de gracia entre la fecha y el barrido del cron.
    scheduledPrice: row.scheduled_price != null ? Number(row.scheduled_price) : null,
    scheduledManualPrice:
      row.scheduled_manual_price != null ? Number(row.scheduled_manual_price) : null,
    priceEffectiveAt: row.price_effective_at ?? null,
    currency: row.currency,
    liveStreamUrl: row.live_stream_url,
    liveStreamProvider: row.live_stream_provider,
    liveStatus: row.live_status,
    dateISO: row.starts_at?.slice(0, 10) ?? '',
    slots: row.capacity ?? DEFAULT_SLOTS,
    registered: Number(registrationCount) || 0,
    featured: Boolean(rules.featured),
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? '',
    eventDays,
    ticketTypes,
    weighInWindows: normalizeWeighInWindows(rules.weighInWindows),
    publicSurface: normalizeEventPublicSurface(rules.publicSurface),
    publicCopy: normalizeEventPublicCopy(rules.publicCopy),
    landing: normalizeEventLanding(rules.landing, {
      publicCopy: rules.publicCopy,
      slug: row.slug,
    }),
    pricing: normalizeEventPricingInput({
      registration: row.price,
      registrationManual: row.manual_price,
      wisePrice: row.wise_price,
      membership: rules.membershipPrice,
      combo: isComboOfferLive({
        active: comboOfferRow?.active === true,
        price: comboOfferRow?.price,
        startsAt: comboOfferRow?.starts_at ?? null,
        endsAt: comboOfferRow?.ends_at ?? null,
        archivedAt: comboOfferRow?.archived_at ?? null,
      })
        ? Number(comboOfferRow.price)
        : rules.comboPrice,
      ticketsEnabled: rules.ticketsEnabled,
      ticketAddons: rules.ticketAddons,
    }),
  }
}

/**
 * Proyeccion apta para landing/dashboard. El mapper administrativo conserva
 * combos apagados y restringidos; esta frontera publica los elimina por
 * completo, incluso del precio legacy guardado en `rules.comboPrice`.
 */
export function mapPublishedEventRow(row, now = new Date()) {
  const event = mapSupabaseEventRow(row)
  // Combo apagado: mismo recorte que `sanitizePublicCatalogEvent` (server),
  // porque el respaldo a Supabase directo no pasa por él.
  const publicOffer = isStoredEventModuleOn(event, 'combo')
    ? resolveLiveComboOffer(event, now)
    : null
  return {
    ...event,
    comboOffer: publicOffer,
    pricing: {
      ...event.pricing,
      combo: publicOffer ? Number(publicOffer.price) : 0,
    },
  }
}

export function mapAdminEventRow(row, index = 0) {
  const capacity = Object.fromEntries(
    (row.capacityRules ?? []).map((item) => [item.key || 'event', item.limit_count]),
  )
  const event = mapSupabaseEventRow(row)

  return {
    ...event,
    date: event.dateISO ? formatEventDate(event.dateISO) : '—',
    // events.capacity es el cupo de atletas. La regla scope=event (key '')
    // es el tope de entradas y puede no existir: no se hereda del cupo.
    slots: row.capacity ?? event.slots ?? DEFAULT_SLOTS,
    ticketCapacity: capacity.event ?? null,
    createdOrder: row.created_at ? new Date(row.created_at).getTime() : index,
  }
}

function constructionLandingRules(event) {
  const landing = event.landing ?? {}
  return {
    templateId: landing.templateId,
    themeId: landing.themeId,
    publicVisible: false,
    ...(landing.layout
      ? { layout: { palette: landing.layout.palette, motion: landing.layout.motion } }
      : {}),
  }
}

/** Espejo cliente de `underConstructionCatalogEvent` (server): solo slug y título. */
function underConstructionPublicEvent(event) {
  return mapSupabaseEventRow({
    id: event.id,
    slug: event.slug,
    title: event.title,
    published: true,
    status: 'proximamente',
    rules: { landing: constructionLandingRules(event) },
  })
}

/**
 * Espejo cliente de `registrationOnlyCatalogEvent` (server): el evento entero
 * para poder inscribirse, sin la página que todavía se está armando.
 */
function registrationOnlyPublicEvent(event) {
  return {
    ...event,
    heroImageUrl: null,
    publicCopy: normalizeEventPublicCopy(null),
    landing: normalizeEventLanding(constructionLandingRules(event), { slug: event.slug }),
  }
}

export const PUBLISHED_EVENTS_SELECT = `
  id, slug, title, description, venue, location,
  starts_at, ends_at,
  registration_opens_at, registration_closes_at,
  ticket_sales_opens_at, ticket_sales_closes_at,
  capacity, status, published, requires_membership, price, manual_price, currency, rules, logo_path,
  scheduled_price, scheduled_manual_price, price_effective_at,
  live_stream_url, live_stream_provider, live_status, created_at, updated_at,
  eventDays:event_days(id, day_index, label, date),
  comboOffer:event_combo_offers(id, membership_plan_id, price, manual_price, currency, active, starts_at, ends_at, audience, financed, archived_at),
  ticketTypes:ticket_types(
    id, name, description, price, wise_price, manual_price, quota, sort_order, active,
    sales_opens_at, sales_closes_at, valid_from, valid_until,
    qr_validity_mode, qr_validity_duration_minutes, access_usage_mode, payment_channels,
    ticketTypeDays:ticket_type_days(event_day_id),
    includedAddons:ticket_type_included_addons(addon_id),
    credentials:ticket_type_credentials(id, label, zone_scopes, sort_order)
  )
`

/** Eventos visibles al público. Preferimos Express (service role) para no
 * depender de RLS/anon del browser; cae a Supabase client si la API no responde. */
export async function fetchPublishedEvents() {
  try {
    const { events } = await apiGet('/api/events/catalog')
    if (Array.isArray(events) && events.length > 0) {
      return events.map((row) => mapPublishedEventRow(row))
    }
  } catch (error) {
    console.warn(
      'Catálogo público vía API no disponible, intento Supabase client.',
      error?.message ?? error,
    )
  }

  if (!isSupabaseConfigured) return []

  const supabase = await getSupabaseClient()
  const { data, error } = await supabase
    .from('events')
    .select(PUBLISHED_EVENTS_SELECT)
    .eq('published', true)
  if (error) throw error
  const events = (data ?? []).map((row) => {
    const logoUrl =
      row.logo_url ??
      (row.logo_path
        ? supabase.storage.from('event-logos').getPublicUrl(row.logo_path).data.publicUrl
        : null)
    const heroPath = row.rules?.landing?.slots?.heroImagePath
    const heroImageUrl =
      row.hero_image_url ??
      (heroPath
        ? supabase.storage.from('event-media').getPublicUrl(heroPath).data.publicUrl
        : null)
    const rules = row.rules
      ? withLandingBlockImageUrls(
          row.rules,
          (path) => supabase.storage.from('event-media').getPublicUrl(path).data.publicUrl,
        )
      : row.rules
    return mapPublishedEventRow({ ...row, rules, logo_url: logoUrl, hero_image_url: heroImageUrl })
  })

  // Si la API no esta disponible, el fallback debe respetar el mismo
  // interruptor de visibilidad que protege el catalogo del servidor: una landing
  // apagada queda solo como "en construccion", sin datos del evento.
  return events.map((event) => {
    if (eventLandingIsPublic(event)) return event
    return hiddenLandingTakesRegistrations(event)
      ? registrationOnlyPublicEvent(event)
      : underConstructionPublicEvent(event)
  })
}

/** Vacío = sin tope de entradas. El número viaja tal cual, incluso 0. */
function normalizeTicketCapacity(value) {
  if (value === '' || value == null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

/** Guarda el evento completo a través de Express y devuelve el estado
 * canónico de la colección. El navegador nunca escribe Supabase directo. */
export async function saveAdminEventRequest(draft, sourceEvent = null) {
  const preview = mapDraftToPreviewEvent(draft, sourceEvent)
  const slug = sourceEvent?.slug ?? draft.slug ?? preview.slug
  if (!slug) throw new Error('Falta el slug del evento.')

  const startsAt = draft.startsAt || (draft.dateISO ? `${draft.dateISO}T00:00:00` : null)
  const endsAt = draft.endsAt || startsAt
  if (!startsAt || !endsAt) throw new Error('Falta la fecha del evento.')

  const response = await apiPost('/api/events/upsert', {
    ...draft,
    // Siempre viaja: null borra el tope de entradas. Omitirlo conservaría
    // el cupo de atletas que antes se copiaba a esa fila.
    ticketCapacity: normalizeTicketCapacity(draft.ticketCapacity),
    id: sourceEvent?.id ?? draft.id,
    expectedUpdatedAt: sourceEvent?.updatedAt ?? draft.expectedUpdatedAt,
    slug,
    startsAt,
    endsAt,
    pricing: normalizeEventPricingInput(draft.pricing),
    weighInWindows: normalizeWeighInWindows(draft.weighInWindows),
    publicSurface: normalizeEventPublicSurface(draft.publicSurface),
    publicCopy: normalizeEventPublicCopy(draft.publicCopy),
    landing: landingPayloadForMerge(
      syncLandingSlotsFromPublicCopy(
        draft.landing ?? emptyEventLanding('meet'),
        draft.publicCopy,
      ),
    ),
    paymentChannelOverrides: normalizeEventPaymentChannelOverrides(draft.paymentChannelOverrides),
    ticketTypes: (draft.ticketTypes ?? []).map((type) => ({
      ...type,
      ...normalizeTicketTypePrices(type),
      paymentChannels: normalizeTicketTypePaymentChannels(type.paymentChannels),
    })),
    bankTransfer: {
      alias: draft.bankTransfer?.alias ?? '',
      cbu: draft.bankTransfer?.cbu ?? '',
      holder: draft.bankTransfer?.holder ?? '',
      // Van a la cuenta reutilizable que se crea con estos datos, no al evento.
      cuit: draft.bankTransfer?.cuit ?? '',
      bankName: draft.bankTransfer?.bankName ?? '',
    },
    bankTransferProfileId: draft.bankTransferProfileId ?? null,
    mercadoPagoProfileId: draft.mercadoPagoProfileId ?? null,
    salesIntent: draft.salesIntent === 'announce' ? 'announce' : 'charge',
    cashPayment: {
      place: String(draft.cashPayment?.place ?? '').trim(),
      notes: String(draft.cashPayment?.notes ?? '').trim(),
      address: String(draft.cashPayment?.address ?? '').trim(),
      hours: String(draft.cashPayment?.hours ?? '').trim(),
      contact: String(draft.cashPayment?.contact ?? '').trim(),
    },
    venueAddress: String(draft.venueAddress ?? '').trim(),
    // Siempre se manda (aunque esté vacío): el upsert reconstruye `rules`, y sin
    // este merge un guardado borraría el formulario cargado.
    externalForm: {
      url: String(draft.externalForm?.url ?? '').trim(),
      label: String(draft.externalForm?.label ?? '').trim(),
    },
    // También siempre: el upsert reconstruye `rules`. Solo viajan las listas que
    // restringen algo; `{}` = ofrece todo.
    offering: offeringForStorage(draft.offering),
    // También siempre: solo viaja lo apagado y los conceptos con tope de cuotas.
    modules: eventModulesForStorage(draft.modules),
    paymentPolicy: paymentPolicyForStorage(draft.paymentPolicy),
  })

  return {
    event: mapAdminEventRow(response.event),
    events: (response.events ?? [response.event]).map(mapAdminEventRow),
    // Lo que se guardó pero queda incompleto (p. ej. transferencia abierta sin
    // destino de cobro en un evento oculto). No es un error: el evento está.
    warnings: Array.isArray(response.warnings) ? response.warnings : [],
  }
}

export async function fetchAdminEvents() {
  const { events } = await apiGet('/api/events')
  return events.map(mapAdminEventRow)
}

/**
 * Habilitar/deshabilitar y cambiar el estado público sin reescribir el evento.
 * `saveAdminEventRequest` recrea días y tipos de entrada en cada guardado, así
 * que para tocar una columna se usa este camino.
 *
 * `requiresMembership` viaja por acá desde 20260826100000: habilitar o
 * deshabilitar un meet como "solo afiliados" era lo único de la operación
 * diaria que obligaba a abrir el editor completo y guardar el evento entero,
 * con el riesgo de recrear la grilla de un evento que ya tiene atletas
 * asignados a tandas.
 *
 * `statusOverridden` viene en true cuando la base corrigió el estado pedido
 * (reabrir un evento que sigue lleno lo devuelve a `agotado`). El panel lo
 * necesita para explicar por qué el badge no dice lo que el operador eligió.
 */
export async function setEventStateRequest(
  slug,
  {
    status,
    published,
    requiresMembership,
    capacityProgressPublic,
    registrationOpensAt,
    registrationClosesAt,
    ticketsEnabled,
  } = {},
) {
  if (!slug) throw new Error('Falta el slug del evento.')

  const payload = {}
  if (status !== undefined) payload.status = status
  if (published !== undefined) payload.published = published
  if (requiresMembership !== undefined) payload.requiresMembership = requiresMembership
  if (capacityProgressPublic !== undefined) payload.capacityProgressPublic = capacityProgressPublic
  // Control de venta: ISO fija la fecha, null la borra.
  if (registrationOpensAt !== undefined) payload.registrationOpensAt = registrationOpensAt
  if (registrationClosesAt !== undefined) payload.registrationClosesAt = registrationClosesAt
  if (ticketsEnabled !== undefined) payload.ticketsEnabled = ticketsEnabled === true

  const response = await apiPost(`/api/events/${encodeURIComponent(slug)}/state`, payload)

  return {
    event: mapAdminEventRow(response.event),
    events: (response.events ?? [response.event]).map(mapAdminEventRow),
    statusOverridden: response.statusOverridden === true,
  }
}

/**
 * Impacto del borrado antes de borrar: lo que el diálogo de confirmación le
 * muestra al operador. `requiresForce` viene en true cuando el evento ya movió
 * plata o gente y la baja necesita consentimiento explícito.
 */
export async function fetchEventDeleteImpact(slug) {
  if (!slug) throw new Error('Falta el slug del evento.')

  const { impact } = await apiGet(`/api/events/${encodeURIComponent(slug)}/delete-impact`)
  return impact
}

/**
 * Borrado definitivo. La cascada (inscripciones, entradas, órdenes, tandas) la
 * resuelve la RPC `delete_event`; acá solo se propaga el consentimiento y se
 * devuelve la colección canónica para que el panel no quede con la fila
 * borrada hasta el próximo refetch.
 */
export async function deleteAdminEventRequest(slug, { force = false } = {}) {
  if (!slug) throw new Error('Falta el slug del evento.')

  const query = force ? '?force=true' : ''
  const response = await apiDelete(`/api/events/${encodeURIComponent(slug)}${query}`)

  return {
    deletedEvent: response.deletedEvent,
    events: (response.events ?? []).map(mapAdminEventRow),
  }
}

// ------------------------------------------------------------------ logo
// Logo / foto del evento: se sube directo a Storage con URL firmada y después se
// guarda la ruta. No pasa por el upsert del evento (ver server/routes/events.js).

export const EVENT_LOGO_MAX_BYTES = 3 * 1024 * 1024
const EVENT_LOGO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
/** 512px cubre el hero del panel a 2x; WebP conserva la transparencia de los logos. */
const EVENT_LOGO_MAX_EDGE = 512
const EVENT_LOGO_TARGET_BYTES = 160 * 1024

export function validateEventLogoFile(file) {
  if (!file) return { error: 'Elegí una imagen.' }
  if (!EVENT_LOGO_MIME_TYPES.has(file.type)) return { error: 'Usá una imagen JPG, PNG o WEBP.' }
  if (file.size > EVENT_LOGO_MAX_BYTES) return { error: 'La imagen supera el límite de 3 MB.' }
  return { ok: true }
}

/**
 * Deja el logo listo para subir: valida, quita el fondo liso (si se pidió) y lo
 * baja a WebP. Es lo que ve la vista previa del alta y lo que después se sube,
 * así que el archivo previsualizado es exactamente el que queda guardado.
 *
 * `backgroundReason` explica por qué no se quitó el fondo cuando se pidió
 * (ver BACKGROUND_REASON); es `null` si no se pidió.
 */
export async function prepareEventLogoFile(file, { removeBackground = false } = {}) {
  const validation = validateEventLogoFile(file)
  if (validation.error) throw new ApiError(validation.error, { status: 400 })

  let source = file
  let backgroundRemoved = false
  let backgroundReason = null
  if (removeBackground) {
    const outcome = await removeImageBackground(file, { outputEdge: EVENT_LOGO_MAX_EDGE })
    source = outcome.file
    backgroundRemoved = outcome.applied
    backgroundReason = outcome.reason
    // Ya salió recortado, al tamaño final y en WebP: recomprimirlo solo lo degradaría.
    if (backgroundRemoved && source.size <= EVENT_LOGO_MAX_BYTES) {
      return { file: source, backgroundRemoved, backgroundReason }
    }
  }

  const prepared = await compressImageFile(source, {
    maxEdge: EVENT_LOGO_MAX_EDGE,
    quality: 0.86,
    targetMaxBytes: EVENT_LOGO_TARGET_BYTES,
    skipUnderBytes: EVENT_LOGO_TARGET_BYTES,
  })
  return { file: prepared, backgroundRemoved, backgroundReason }
}

/**
 * Sube la imagen y deja guardado el logo. Devuelve `{ event, events,
 * backgroundRemoved }` ya mapeados; con `file = null` quita el logo.
 *
 * `prepared: true` indica que el archivo ya pasó por `prepareEventLogoFile`
 * (el alta lo prepara al elegirlo, para mostrarlo): no se procesa dos veces.
 */
export async function setEventLogoRequest(
  slug,
  file,
  { removeBackground = false, prepared: alreadyPrepared = false } = {},
) {
  if (!slug) throw new Error('Falta el slug del evento.')
  const base = `/api/events/${encodeURIComponent(slug)}/logo`

  let path = null
  let backgroundRemoved = false
  if (file) {
    const validation = validateEventLogoFile(file)
    if (validation.error) throw new ApiError(validation.error, { status: 400 })
    if (!isSupabaseConfigured) {
      throw new ApiError('Supabase no está configurado. No se puede subir la imagen.', {
        status: 503,
      })
    }

    const prepared = alreadyPrepared
      ? { file }
      : await prepareEventLogoFile(file, { removeBackground })
    backgroundRemoved = Boolean(prepared.backgroundRemoved)
    const upload = await apiPost(`${base}/upload-url`, {
      contentType: prepared.file.type,
      size: prepared.file.size,
    })
    const supabase = await getSupabaseClient()
    const { error } = await supabase.storage
      .from('event-logos')
      .uploadToSignedUrl(upload.path, upload.token, prepared.file, {
        contentType: prepared.file.type,
        cacheControl: '31536000',
      })
    if (error) throw new ApiError(error.message || 'No se pudo subir la imagen.', { status: 502 })
    path = upload.path
  }

  const response = await apiPatch(base, { path })
  return {
    event: mapAdminEventRow(response.event),
    events: (response.events ?? [response.event]).map(mapAdminEventRow),
    backgroundRemoved,
  }
}

// ------------------------------------------------------------------ hero landing
// Imagen hero de la plantilla: se sube a `event-media` y la ruta viaja en
// `landing.slots.heroImagePath` al guardar el evento (no hay PATCH aparte).

export const EVENT_HERO_MAX_BYTES = 5 * 1024 * 1024
const EVENT_HERO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const EVENT_HERO_MAX_EDGE = 1920
const EVENT_HERO_TARGET_BYTES = 480 * 1024

export function validateEventHeroFile(file) {
  if (!file) return { error: 'Elegí una imagen.' }
  if (!EVENT_HERO_MIME_TYPES.has(file.type)) return { error: 'Usá una imagen JPG, PNG o WEBP.' }
  if (file.size > EVENT_HERO_MAX_BYTES) return { error: 'La imagen supera el límite de 5 MB.' }
  return { ok: true }
}

/**
 * Sube el hero a Storage y devuelve `{ path, url }` para meter en el draft.
 * No persiste en la base: eso ocurre al guardar el evento con el merge de landing.
 */
export async function uploadEventHeroRequest(slug, file) {
  if (!slug) throw new Error('Falta el slug del evento.')
  const validation = validateEventHeroFile(file)
  if (validation.error) throw new ApiError(validation.error, { status: 400 })
  if (!isSupabaseConfigured) {
    throw new ApiError('Supabase no está configurado. No se puede subir la imagen.', {
      status: 503,
    })
  }

  const prepared = await compressImageFile(file, {
    maxEdge: EVENT_HERO_MAX_EDGE,
    quality: 0.86,
    targetMaxBytes: EVENT_HERO_TARGET_BYTES,
    skipUnderBytes: EVENT_HERO_TARGET_BYTES,
  })

  const upload = await apiPost(`/api/events/${encodeURIComponent(slug)}/hero/upload-url`, {
    contentType: prepared.type,
    size: prepared.size,
  })
  const supabase = await getSupabaseClient()
  const { error } = await supabase.storage
    .from('event-media')
    .uploadToSignedUrl(upload.path, upload.token, prepared, {
      contentType: prepared.type,
      cacheControl: '31536000',
    })
  if (error) throw new ApiError(error.message || 'No se pudo subir la imagen.', { status: 502 })
  return { path: upload.path, url: upload.url ?? null }
}
