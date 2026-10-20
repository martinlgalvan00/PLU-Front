import { isTicketSalesEnabled } from './eventPricing.js'
import { getPublicEventStatus } from './publicRegistrationPhase.js'
import { isRegistrationOpen } from './status.js'

function eventCreatedRank(event) {
  if (event?.navPinned) return Number.MAX_SAFE_INTEGER
  if (Number.isFinite(Number(event?.createdOrder))) return Number(event.createdOrder)
  const createdTime = event?.createdAt ? Date.parse(event.createdAt) : Number.NaN
  if (Number.isFinite(createdTime)) return createdTime
  const idTime = String(event?.id ?? '').match(/\d{10,}/)?.[0]
  if (idTime) return Number(idTime)
  return 0
}

export function getLatestCreatedEvent(events = []) {
  return (
    [...events]
      .filter((event) => event && event.status !== 'finalizado')
      .sort((a, b) => eventCreatedRank(b) - eventCreatedRank(a))[0] ?? null
  )
}

function eventDateTime(event) {
  const value = event?.dateISO ?? event?.startsAt ?? event?.startDate
  if (!value) return Number.POSITIVE_INFINITY
  const normalized = String(value).includes('T') ? String(value) : `${value}T12:00:00`
  const time = Date.parse(normalized)
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY
}

export function getUpcomingEventsByDate(events = [], now = new Date()) {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const todayTime = today.getTime()

  const datedEvents = events
    .filter(
      (event) => event && event.status !== 'finalizado' && Number.isFinite(eventDateTime(event)),
    )
    .sort(
      (a, b) => eventDateTime(a) - eventDateTime(b) || eventCreatedRank(b) - eventCreatedRank(a),
    )

  const upcoming = datedEvents.filter((event) => eventDateTime(event) >= todayTime)
  return upcoming.length ? upcoming : datedEvents
}

export function getNextUpcomingEvent(events = [], now = new Date()) {
  return getUpcomingEventsByDate(events, now)[0] ?? null
}

/**
 * Stubs de desarrollo que no deben salir en el catálogo público
 * (título/slug triviales tipo "test", "test test", "prueba"). No aplica a
 * meets reales con "test" en el nombre compuesto. El panel admin no filtra.
 */
export function isPublicCatalogStubEvent(event) {
  const title = String(event?.title ?? '')
    .trim()
    .toLowerCase()
  const slug = String(event?.slug ?? '')
    .trim()
    .toLowerCase()
  if (!title && !slug) return true
  const titleIsStub = /^(test|prueba|asd|xxx|demo)(\s+\1)*$/i.test(title)
  const slugIsStub = /^(test|prueba|demo|asd|xxx)(-\d{2,4})?$/i.test(slug)
  return titleIsStub || slugIsStub
}

export const isHomeCalendarStubEvent = isPublicCatalogStubEvent

export function getPublicCatalogEvents(events = [], _options = {}) {
  // El catálogo público nunca lista stubs ni eventos ocultos. `_options
  // .includeDevelopmentStubs` se ignora a propósito: en Vite/Vitest
  // `import.meta.env.DEV` es true y usarlo filtraría mal el sitio público
  // (y el CI). El admin usa la lista cruda.
  //
  // La visibilidad se protege acá, además del filtro de la API y de App: así
  // una pantalla pública nueva no puede publicar por accidente un evento que
  // el staff acabó de ocultar. La ausencia de `published` se mantiene visible
  // para los datos editoriales legacy que no conocen todavía ese campo.
  return (Array.isArray(events) ? events : []).filter(
    (event) => event && event.published !== false && !isPublicCatalogStubEvent(event),
  )
}

/**
 * Protagonista del countdown Home: excluye stubs, prefiere featured vigente,
 * si no el próximo por fecha.
 */
export function getHomeCalendarSpotlightEvent(events = [], now = new Date()) {
  const eligible = getPublicCatalogEvents(events).filter((event) => event.status !== 'finalizado')
  if (eligible.length === 0) return null

  const upcoming = getUpcomingEventsByDate(eligible, now)
  const featured = eligible.find((event) => event.featured)
  if (featured && upcoming.some((event) => event.slug === featured.slug)) {
    return featured
  }

  return upcoming[0] ?? null
}

export function getHomeCalendarFollowingEvents(
  events = [],
  spotlight = null,
  limit = 2,
  now = new Date(),
) {
  const eligible = getPublicCatalogEvents(events).filter((event) => event.status !== 'finalizado')
  const upcoming = getUpcomingEventsByDate(eligible, now)
  const spotlightSlug = spotlight?.slug
  return upcoming.filter((event) => !spotlightSlug || event.slug !== spotlightSlug).slice(0, limit)
}

export function getFeaturedEvent(events = []) {
  // El destacado explícito manda (staff_upsert_event garantiza que hay a lo
  // sumo uno). Si no hay ninguno marcado, se cae al próximo por fecha en vez
  // de events[0], que dependía del orden arbitrario del fetch y podía promover
  // como "Pitbull" un evento cualquiera (incluso uno ya finalizado).
  return events.find((event) => event.featured) ?? getNextUpcomingEvent(events)
}

/**
 * Hasta dos eventos vigentes para Competencia (navbar, drawer, footer).
 * Slot 1: destacado si sigue en el catálogo próximo; si no, el próximo por fecha.
 * Slot 2: Pitbull si es otro meet publicado vigente; si no, el siguiente upcoming.
 * Un solo `featured` de staff; el segundo slot es derivado. Stubs y ocultos
 * no entran (mismo filtro que el catálogo público).
 */
export function getCompetitionNavEvents(events = [], now = new Date()) {
  const eligible = getPublicCatalogEvents(events).filter((event) => event.status !== 'finalizado')
  if (eligible.length === 0) return []

  const upcoming = getUpcomingEventsByDate(eligible, now)
  const featured = eligible.find((event) => event.featured)
  const pitbull = eligible.find(isPitbullClassicEvent)

  const first =
    featured && upcoming.some((event) => event.slug === featured.slug)
      ? featured
      : (upcoming[0] ?? null)
  if (!first) return []

  const remaining = upcoming.filter((event) => event.slug !== first.slug)
  const pitbullAsSecond =
    pitbull &&
    pitbull.slug !== first.slug &&
    remaining.some((event) => event.slug === pitbull.slug)
      ? pitbull
      : null
  const second = pitbullAsSecond ?? remaining[0] ?? null

  return second ? [first, second] : [first]
}

export function getCompetitionNavEventKey(event) {
  return event?.slug ? `event:${event.slug}` : null
}

/**
 * Slug canónico del meet insignia. La landing editorial ya no se gatea por
 * slug: usa `landing.templateId === 'editorial'`. Este helper queda para
 * seeds, analytics y el alias `/pitbull`.
 */
export const PITBULL_CLASSIC_SLUG = 'pitbull-classic-2026'

export function isPitbullClassicEvent(event) {
  return event?.slug === PITBULL_CLASSIC_SLUG
}

/**
 * La landing editorial de Pitbull siempre representa a Pitbull. No puede usar
 * `getFeaturedEvent`: el destacado es una eleccion del panel para Home y puede
 * ser otro torneo con otro precio (o incluso un evento de prueba).
 */
export function getPitbullClassicEvent(events = []) {
  return events.find(isPitbullClassicEvent) ?? null
}

/**
 * Destino público de un evento (destacado u otro). Siempre la ficha por slug;
 * el renderer elige plantilla `meet` vs `editorial`. `/pitbull` queda como
 * alias deprecado que App reescribe a este destino.
 */
export function getFeaturedEventDestination(event) {
  if (!event?.slug) return { view: 'events', options: {} }
  return { view: 'events', options: { eventSlug: event.slug } }
}

function isBarbellSubmissionEvent(event) {
  return String(event?.slug ?? '')
    .toLowerCase()
    .startsWith('barbell-submission')
}

/**
 * Atajos operativos del hero de Home: entradas (Pitbull u otro con tickets) e
 * inscripción (abierta o teaser "próximamente", prioriza Barbell Submission).
 * No promociona meets cerrados/finalizados como inscripción.
 *
 * @param {object[]} [events]
 * @param {{
 *   now?: Date,
 *   registrationEnabled?: boolean,
 *   ticketSalesEnabled?: boolean,
 * }} [options]
 * @returns {{ kind: 'tickets' | 'registration' | 'registration_soon', event: object }[]}
 */
export function getSeasonHomeActions(
  events = [],
  { now = new Date(), registrationEnabled = true, ticketSalesEnabled = true } = {},
) {
  const catalog = getPublicCatalogEvents(events)
  const actions = []

  const ticketEvent =
    [getPitbullClassicEvent(catalog), ...catalog].find(
      (event) => event && ticketSalesEnabled && isTicketSalesEnabled(event),
    ) ?? null
  if (ticketEvent) {
    actions.push({ kind: 'tickets', event: ticketEvent })
  }

  const withPublicStatus = (event) => ({
    event,
    status: getPublicEventStatus(event, now, { registrationEnabled }),
  })

  const openForRegistration = catalog
    .map(withPublicStatus)
    .filter(({ status }) => isRegistrationOpen(status))
  const openRegistration =
    openForRegistration.find(({ event }) => isBarbellSubmissionEvent(event)) ??
    openForRegistration.find(({ event }) => event?.slug !== ticketEvent?.slug) ??
    openForRegistration[0] ??
    null

  if (openRegistration) {
    actions.push({ kind: 'registration', event: openRegistration.event })
    return actions
  }

  // Teaser: próximo meet en "próximamente" (Barbell / Virtus), no cerrado ni finalizado.
  const upcomingTeasers = catalog
    .map(withPublicStatus)
    .filter(
      ({ event, status }) =>
        status === 'proximamente' &&
        event?.slug !== ticketEvent?.slug &&
        event?.status !== 'finalizado',
    )
    .sort((a, b) => eventDateTime(a.event) - eventDateTime(b.event))

  const soonRegistration =
    upcomingTeasers.find(({ event }) => isBarbellSubmissionEvent(event)) ??
    upcomingTeasers[0] ??
    null

  if (soonRegistration) {
    actions.push({ kind: 'registration_soon', event: soonRegistration.event })
  }

  return actions
}

export function getDaysUntilEvent(event, now = new Date()) {
  const eventTime = eventDateTime(event)
  if (!Number.isFinite(eventTime)) return null
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const eventDay = new Date(eventTime)
  eventDay.setHours(0, 0, 0, 0)
  const diffDays = Math.round((eventDay.getTime() - today.getTime()) / 86400000)
  return diffDays >= 0 ? diffDays : null
}

/**
 * Countdown editorial: devuelve { days, hours, minutes, totalMs, isPast }
 * hasta el startsAt exacto (con hora) del evento. Si el evento solo tiene
 * dateISO (sin hora), asume mediodía para dar un valor razonable.
 */
export function getTimeUntilEvent(event, now = new Date()) {
  const eventTime = eventDateTime(event)
  if (!Number.isFinite(eventTime)) return null

  const diff = eventTime - now.getTime()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, totalMs: 0, isPast: true }

  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)

  return { days, hours, minutes, totalMs: diff, isPast: false }
}
