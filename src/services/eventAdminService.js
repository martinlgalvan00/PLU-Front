import { DEFAULT_EVENT_PRICING, normalizeEventPricingInput } from '../lib/eventPricing.js'
import { UPCOMING_EVENTS } from '../lib/events.js'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'
import { apiGet, apiPost } from '../lib/api.js'

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
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }).replace('.', '')
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
    location: event.location ?? '',
    status: event.status ?? 'proximamente',
    featured: Boolean(event.featured),
    slots: event.slots ?? DEFAULT_SLOTS,
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
      dayIndexes: [...(type.dayIndexes ?? [])],
      includedAddonIds: [...(type.includedAddonIds ?? [])],
    })),
    liveStreamUrl: event.liveStreamUrl ?? '',
    liveStreamProvider: event.liveStreamProvider ?? 'youtube',
    liveStatus: event.liveStatus ?? 'offline',
    published: event.published === true,
    requiresMembership: event.requiresMembership !== false,
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
    location: draft.location?.trim() || 'Ciudad',
    status: draft.status || 'proximamente',
    featured: Boolean(draft.featured),
    slots,
    registered: sourceEvent?.registered ?? 0,
    published: draft.published === true,
    requiresMembership: draft.requiresMembership !== false,
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

  if (draft.pricing?.ticketsEnabled !== false && ticketSalesClosesAt && ticketSalesClosesAt < now) {
    warnings.push('ticketSalesClosedButEnabled')
  }

  if (status === 'finalizado' && endsAt && endsAt > now) {
    warnings.push('finishedButNotEnded')
  }

  return warnings
}

export function getInitialAdminEvents(storedEvents) {
  const seed = UPCOMING_EVENTS.map((event, index) => ({
    id: `evt-${index + 1}`,
    ...event,
    createdAt: event.createdAt ?? `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    createdOrder: index + 1,
    slots: event.featured ? 120 : DEFAULT_SLOTS,
    registered: event.featured ? 48 : Math.floor(DEFAULT_SLOTS * 0.35),
    pricing: { ...DEFAULT_EVENT_PRICING },
    published: event.published ?? true,
    requiresMembership: event.requiresMembership !== false,
  }))

  if (!storedEvents?.length) return seed

  const seedBySlug = Object.fromEntries(seed.map((event) => [event.slug, event]))
  const merged = storedEvents.map((event, index) => ({
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

export function filterAdminEvents(events, { query = '', status = 'all' } = {}) {
  const normalizedQuery = query.trim().toLowerCase()

  return events.filter((event) => {
    const statusMatch = status === 'all' || event.status === status
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

    return statusMatch && queryMatch
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
    liveStreamUrl: payload.liveStreamUrl ?? '',
    liveStreamProvider: payload.liveStreamProvider ?? 'youtube',
    liveStatus: payload.liveStatus ?? 'offline',
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
      liveStreamUrl: payload.liveStreamUrl ?? event.liveStreamUrl ?? '',
      liveStreamProvider: payload.liveStreamProvider ?? event.liveStreamProvider ?? 'youtube',
      liveStatus: payload.liveStatus ?? event.liveStatus ?? 'offline',
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

export const ADMIN_EVENT_FORM_DEFAULT = {
  title: '',
  description: '',
  dateISO: '',
  venue: '',
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
  eventDays: [],
  ticketTypes: [],
  liveStreamUrl: '',
  liveStreamProvider: 'youtube',
  liveStatus: 'offline',
  published: false,
  requiresMembership: true,
}

/**
 * Métricas de entradas (espectadores) para un evento en el panel admin.
 */
export function buildEventTicketStats(tickets, eventSlug) {
  const eventTickets = tickets.filter((ticket) => ticket.eventSlug === eventSlug)
  const paid = eventTickets.filter(
    (ticket) => ticket.status === 'pagada' || ticket.status === 'usada',
  )
  const pending = eventTickets.filter((ticket) => ticket.status === 'pendiente_pago')
  const checkedIn = eventTickets.filter((ticket) => Boolean(ticket.checkedInAt))
  const revenue = paid.reduce((sum, ticket) => sum + (ticket.unitPrice ?? 0), 0)
  const byTicketType = {}

  for (const ticket of paid) {
    const key = ticket.ticketTypeId ?? 'sin-tipo'
    if (!byTicketType[key]) {
      byTicketType[key] = {
        ticketTypeId: ticket.ticketTypeId,
        name: ticket.ticketTypeName ?? key,
        count: 0,
      }
    }
    byTicketType[key].count += 1
  }

  return {
    total: eventTickets.length,
    sold: paid.length,
    pending: pending.length,
    checkedIn: checkedIn.length,
    revenue,
    byTicketType: Object.values(byTicketType),
  }
}

/** Reconstruye eventDays/ticketTypes desde las filas joineadas de Supabase. */
function mapSupabaseTicketCatalog(row) {
  const eventDays = (row.eventDays ?? [])
    .map((day) => ({ id: day.id, dayIndex: day.day_index, label: day.label, date: day.date }))
    .sort((a, b) => a.dayIndex - b.dayIndex)

  const dayIndexById = Object.fromEntries(eventDays.map((day) => [day.id, day.dayIndex]))

  const ticketTypes = (row.ticketTypes ?? [])
    .map((type) => ({
      id: type.id,
      name: type.name,
      price: type.price,
      quota: type.quota,
      sortOrder: type.sort_order,
      active: type.active,
      dayIndexes: (type.ticketTypeDays ?? [])
        .map((link) => dayIndexById[link.event_day_id])
        .filter((value) => value !== undefined),
      includedAddonIds: (type.includedAddons ?? []).map((link) => link.addon_id),
    }))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  return { eventDays, ticketTypes }
}

export function mapSupabaseEventRow(row) {
  const rules = row.rules ?? {}
  const { eventDays, ticketTypes } = mapSupabaseTicketCatalog(row)
  const registrationRows = row.eventRegistrations ?? row.event_registrations
  const registrationCount = Array.isArray(registrationRows)
    ? countActiveRegistrations(registrationRows)
    : (row.registrationCount ?? row.registration_count ?? 0)

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description ?? '',
    venue: row.venue,
    location: row.location,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    registrationOpensAt: row.registration_opens_at,
    registrationClosesAt: row.registration_closes_at,
    ticketSalesOpensAt: row.ticket_sales_opens_at,
    ticketSalesClosesAt: row.ticket_sales_closes_at,
    capacity: row.capacity,
    status: row.status,
    published: row.published,
    requiresMembership: row.requires_membership !== false,
    price: row.price,
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
    pricing: normalizeEventPricingInput({
      registration: row.price,
      membership: rules.membershipPrice,
      combo: rules.comboPrice,
      ticketsEnabled: rules.ticketsEnabled,
      ticketAddons: rules.ticketAddons,
    }),
  }
}

function mapAdminEventRow(row, index = 0) {
  const capacity = Object.fromEntries(
    (row.capacityRules ?? []).map((item) => [item.key || 'event', item.limit_count]),
  )
  const event = mapSupabaseEventRow(row)

  return {
    ...event,
    date: event.dateISO ? formatEventDate(event.dateISO) : '—',
    slots: row.capacity ?? capacity.event ?? event.slots ?? DEFAULT_SLOTS,
    createdOrder: row.created_at ? new Date(row.created_at).getTime() : index,
  }
}

const PUBLISHED_EVENTS_SELECT = `
  *,
  eventDays:event_days(*),
  ticketTypes:ticket_types(
    *,
    ticketTypeDays:ticket_type_days(event_day_id),
    includedAddons:ticket_type_included_addons(addon_id)
  )
`

/** Eventos visibles al público — usado por EventsPage para enriquecer los
 * eventos mock con startsAt/endsAt/live antes de renderizarlos. */
export async function fetchPublishedEvents() {
  if (!isSupabaseConfigured || !supabase) return []

  const { data, error } = await supabase
    .from('events')
    .select(PUBLISHED_EVENTS_SELECT)
    .eq('published', true)
  if (error) throw error
  return (data ?? []).map(mapSupabaseEventRow)
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
    id: sourceEvent?.id ?? draft.id,
    expectedUpdatedAt: sourceEvent?.updatedAt ?? draft.expectedUpdatedAt,
    slug,
    startsAt,
    endsAt,
    pricing: normalizeEventPricingInput(draft.pricing),
  })

  return {
    event: mapAdminEventRow(response.event),
    events: (response.events ?? [response.event]).map(mapAdminEventRow),
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
 * `statusOverridden` viene en true cuando la base corrigió el estado pedido
 * (reabrir un evento que sigue lleno lo devuelve a `agotado`). El panel lo
 * necesita para explicar por qué el badge no dice lo que el operador eligió.
 */
export async function setEventStateRequest(slug, { status, published } = {}) {
  if (!slug) throw new Error('Falta el slug del evento.')

  const payload = {}
  if (status !== undefined) payload.status = status
  if (published !== undefined) payload.published = published

  const response = await apiPost(`/api/events/${encodeURIComponent(slug)}/state`, payload)

  return {
    event: mapAdminEventRow(response.event),
    events: (response.events ?? [response.event]).map(mapAdminEventRow),
    statusOverridden: response.statusOverridden === true,
  }
}
