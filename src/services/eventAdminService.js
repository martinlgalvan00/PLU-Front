import { DEFAULT_EVENT_PRICING, normalizeEventPricingInput } from '../lib/eventPricing.js'
import { UPCOMING_EVENTS } from '../lib/events.js'

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
    slots: event.featured ? 120 : DEFAULT_SLOTS,
    registered: event.featured ? 48 : Math.floor(DEFAULT_SLOTS * 0.35),
    pricing: { ...DEFAULT_EVENT_PRICING },
  }))

  if (!storedEvents?.length) return seed

  const seedBySlug = Object.fromEntries(seed.map((event) => [event.slug, event]))
  const merged = storedEvents
    .filter((event) => seedBySlug[event.slug])
    .map((event) => ({ ...seedBySlug[event.slug], ...event }))

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
    slots: Number(payload.slots) || DEFAULT_SLOTS,
    registered: 0,
    pricing: normalizeEventPricingInput(payload.pricing),
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
