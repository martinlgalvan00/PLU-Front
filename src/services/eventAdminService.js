import { DEFAULT_EVENT_PRICING, normalizeEventPricingInput } from '../lib/eventPricing.js'
import { UPCOMING_EVENTS } from '../lib/events.js'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

const DEFAULT_SLOTS = 80

function slugify(title, dateISO) {
  const base = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const year = dateISO?.slice(0, 4) ?? '2026'
  return `${base}-${year}`
}

function formatEventDate(dateISO) {
  if (!dateISO) return '—'
  const date = new Date(`${dateISO}T12:00:00`)
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }).replace('.', '')
}

export function mapDraftToPreviewEvent(draft, sourceEvent = null) {
  const title = draft.title?.trim() || 'Título del evento'
  const dateISO = draft.dateISO || sourceEvent?.dateISO || ''
  const slots = Math.max(1, Number(draft.slots) || sourceEvent?.slots || DEFAULT_SLOTS)

  return {
    id: draft.id ?? sourceEvent?.id ?? 'preview',
    title,
    date: dateISO ? formatEventDate(dateISO) : '—',
    dateISO,
    venue: draft.venue?.trim() || 'Sede del evento',
    location: draft.location?.trim() || 'Ciudad',
    status: draft.status || 'proximamente',
    featured: Boolean(draft.featured),
    slots,
    registered: sourceEvent?.registered ?? 0,
    slug: title && dateISO ? slugify(title, dateISO) : sourceEvent?.slug ?? 'evento-preview',
  }
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
  }))

  if (!storedEvents?.length) return seed

  const seedBySlug = Object.fromEntries(seed.map((event) => [event.slug, event]))
  const merged = storedEvents
    .map((event, index) => ({
      ...(seedBySlug[event.slug] ?? {}),
      ...event,
      createdAt: event.createdAt ?? seedBySlug[event.slug]?.createdAt ?? `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      createdOrder: event.createdOrder ?? seedBySlug[event.slug]?.createdOrder ?? Date.now() + index,
      published: event.published ?? seedBySlug[event.slug]?.published ?? true,
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
    const queryMatch =
      !normalizedQuery ||
      event.title.toLowerCase().includes(normalizedQuery) ||
      event.venue.toLowerCase().includes(normalizedQuery) ||
      event.location.toLowerCase().includes(normalizedQuery) ||
      event.slug.includes(normalizedQuery)

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
  const event = {
    id: `evt-${Date.now()}`,
    title: payload.title.trim(),
    date,
    dateISO,
    venue: payload.venue.trim(),
    location: payload.location.trim(),
    slug: slugify(payload.title, dateISO),
    status: payload.status ?? 'proximamente',
    featured: Boolean(payload.featured),
    createdAt,
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
    capacityDay1: payload.capacityDay1 ?? '',
    capacityDay2: payload.capacityDay2 ?? '',
    capacityBoth: payload.capacityBoth ?? '',
    liveStreamUrl: payload.liveStreamUrl ?? '',
    liveStreamProvider: payload.liveStreamProvider ?? 'youtube',
    liveStatus: payload.liveStatus ?? 'offline',
    published: Boolean(payload.published),
  }

  return {
    event,
    events: [event, ...events],
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

  const nextEvents = events.map((event) => {
    if (event.id !== eventId) return event

    const dateISO = payload.dateISO ?? event.dateISO
    updated = {
      ...event,
      title: payload.title?.trim() ?? event.title,
      dateISO,
      date: formatEventDate(dateISO),
      venue: payload.venue?.trim() ?? event.venue,
      location: payload.location?.trim() ?? event.location,
      status: payload.status ?? event.status,
      featured: payload.featured ?? event.featured,
      slots: Number(payload.slots) || event.slots,
      slug: slugify(payload.title ?? event.title, dateISO),
      pricing: normalizeEventPricingInput(payload.pricing ?? event.pricing),
      startsAt: payload.startsAt ?? event.startsAt ?? '',
      endsAt: payload.endsAt ?? event.endsAt ?? '',
      registrationOpensAt: payload.registrationOpensAt ?? event.registrationOpensAt ?? '',
      registrationClosesAt: payload.registrationClosesAt ?? event.registrationClosesAt ?? '',
      ticketSalesOpensAt: payload.ticketSalesOpensAt ?? event.ticketSalesOpensAt ?? '',
      ticketSalesClosesAt: payload.ticketSalesClosesAt ?? event.ticketSalesClosesAt ?? '',
      capacityDay1: payload.capacityDay1 ?? event.capacityDay1 ?? '',
      capacityDay2: payload.capacityDay2 ?? event.capacityDay2 ?? '',
      capacityBoth: payload.capacityBoth ?? event.capacityBoth ?? '',
      liveStreamUrl: payload.liveStreamUrl ?? event.liveStreamUrl ?? '',
      liveStreamProvider: payload.liveStreamProvider ?? event.liveStreamProvider ?? 'youtube',
      liveStatus: payload.liveStatus ?? event.liveStatus ?? 'offline',
      published: Boolean(payload.published),
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
  ['cerrado', 'status'],
  ['finalizado', 'status'],
]

export const ADMIN_EVENT_FORM_DEFAULT = {
  title: '',
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
  capacityDay1: '',
  capacityDay2: '',
  capacityBoth: '',
  liveStreamUrl: '',
  liveStreamProvider: 'youtube',
  liveStatus: 'offline',
  published: false,
}

/**
 * Métricas de entradas (espectadores) para un evento en el panel admin.
 */
export function buildEventTicketStats(tickets, eventSlug) {
  const eventTickets = tickets.filter((ticket) => ticket.eventSlug === eventSlug)
  const paid = eventTickets.filter((ticket) => ticket.status === 'pagada' || ticket.status === 'usada')
  const pending = eventTickets.filter((ticket) => ticket.status === 'pendiente_pago')
  const checkedIn = eventTickets.filter((ticket) => Boolean(ticket.checkedInAt))
  const revenue = paid.reduce((sum, ticket) => sum + (ticket.unitPrice ?? 0), 0)
  const byPass = { day1: 0, day2: 0, both: 0 }

  for (const ticket of paid) {
    if (byPass[ticket.dayPass] !== undefined) byPass[ticket.dayPass] += 1
  }

  return {
    total: eventTickets.length,
    sold: paid.length,
    pending: pending.length,
    checkedIn: checkedIn.length,
    revenue,
    byPass,
  }
}

/**
 * Fase 1 — calendario/directo/cupos viven en Supabase (supabase/migrations/
 * 20260706030000_phase1_events_ticketing.sql), no en localStorage. El resto
 * del catálogo de eventos (título/venue/pricing/featured) sigue en
 * localStorage por ahora — ver AdminEventEditor.jsx.
 */
export function mapSupabaseEventRow(row) {
  return {
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
    requiresMembership: row.requires_membership,
    price: row.price,
    currency: row.currency,
    liveStreamUrl: row.live_stream_url,
    liveStreamProvider: row.live_stream_provider,
    liveStatus: row.live_status,
  }
}

/** Eventos visibles al público — usado por EventsPage para enriquecer los
 * eventos mock con startsAt/endsAt/live antes de renderizarlos. */
export async function fetchPublishedEvents() {
  if (!isSupabaseConfigured || !supabase) return []

  const { data, error } = await supabase.from('events').select('*').eq('published', true)
  if (error) throw error
  return (data ?? []).map(mapSupabaseEventRow)
}

/**
 * Escribe los campos de calendario/directo/cupos de un evento en Supabase
 * (upsert por slug). Requiere una sesión de Supabase con rol admin (RLS
 * `events_write_admin`) — hasta que la fase de migración de auth conecte
 * el login del panel a Supabase Auth, esta llamada va a fallar con un
 * error de permisos; se deja implementada para que empiece a funcionar
 * en cuanto esa fase esté lista, sin tener que reescribir el formulario.
 */
export async function upsertEventCalendarLiveFields(draft) {
  if (!isSupabaseConfigured || !supabase) return null

  if (!draft.slug) throw new Error('Falta el slug del evento.')

  const startsAt = draft.startsAt || (draft.dateISO ? `${draft.dateISO}T00:00:00` : null)
  const endsAt = draft.endsAt || startsAt
  if (!startsAt || !endsAt) throw new Error('Falta la fecha del evento.')

  const { data: event, error } = await supabase
    .from('events')
    .upsert(
      {
        slug: draft.slug,
        title: draft.title,
        venue: draft.venue,
        location: draft.location,
        starts_at: startsAt,
        ends_at: endsAt,
        registration_opens_at: draft.registrationOpensAt || null,
        registration_closes_at: draft.registrationClosesAt || null,
        ticket_sales_opens_at: draft.ticketSalesOpensAt || null,
        ticket_sales_closes_at: draft.ticketSalesClosesAt || null,
        status: draft.status,
        published: Boolean(draft.published),
        price: Number(draft.pricing?.registration) || 0,
        rules: {
          ticketAddons: normalizeEventPricingInput(draft.pricing).ticketAddons,
        },
        live_stream_url: draft.liveStreamUrl || null,
        live_stream_provider: draft.liveStreamProvider || null,
        live_status: draft.liveStatus || 'offline',
      },
      { onConflict: 'slug' },
    )
    .select()
    .single()

  if (error) throw error

  const capacityRows = [
    ['day1', draft.capacityDay1],
    ['day2', draft.capacityDay2],
    ['both', draft.capacityBoth],
  ]
    .filter(([, limit]) => limit !== '' && limit != null)
    .map(([key, limit]) => ({ event_id: event.id, scope: 'day', key, limit_count: Number(limit) }))

  if (capacityRows.length > 0) {
    const { error: capacityError } = await supabase
      .from('event_capacity_rules')
      .upsert(capacityRows, { onConflict: 'event_id,scope,key' })
    if (capacityError) throw capacityError
  }

  return mapSupabaseEventRow(event)
}
