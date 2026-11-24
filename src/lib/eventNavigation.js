import { canBuyEventTickets } from './eventPublicActions.js'
import { getPublicEventStatus } from './publicRegistrationPhase.js'
import { isRegistrationOpen } from './status.js'
import { hiddenLandingTakesRegistrations } from '../../shared/registrationSaleState.js'

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

/**
 * Orden de lectura del calendario: lo que viene, del más cercano al más lejano;
 * lo terminado, del más reciente al más viejo. Sin fecha, al final. No depende
 * del orden en que llegan los eventos (el catálogo los manda por fecha, pero la
 * lista del panel que ve el staff no).
 *
 * @param {object[]} events
 * @param {{ finished?: boolean }} [options]
 */
export function sortEventsForCalendar(events = [], { finished = false } = {}) {
  return [...events].sort((a, b) => {
    const left = eventDateTime(a)
    const right = eventDateTime(b)
    if (left === right) return 0
    if (!Number.isFinite(left)) return 1
    if (!Number.isFinite(right)) return -1
    return finished ? right - left : left - right
  })
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

/**
 * Landing con el interruptor apagado: el evento existe pero su plataforma está
 * "en construcción". El evento mapeado trae `landing`; la fila cruda, `rules.landing`.
 */
export function isUnderConstructionEvent(event) {
  const landing = event?.landing ?? event?.rules?.landing
  return landing?.publicVisible === false
}

/**
 * Eventos publicados cuya landing está en construcción. Salen del catálogo, los
 * destacados y los countdowns (no tienen datos), pero el menú los muestra y al
 * tocarlos la landing dice "Plataforma en construcción".
 */
export function getUnderConstructionEvents(events = []) {
  return (Array.isArray(events) ? events : []).filter(
    (event) =>
      event?.slug &&
      event.published !== false &&
      !isPublicCatalogStubEvent(event) &&
      isUnderConstructionEvent(event),
  )
}

/**
 * El evento en el que alguien se puede inscribir por slug: el catálogo público
 * o una landing en construcción con la venta abierta (su aviso lleva
 * "Inscribirme"). Una landing apagada con la venta cerrada no se ofrece.
 *
 * @param {string|null|undefined} slug
 * @param {object[]} catalogEvents eventos públicos (ya con el estado resuelto)
 * @param {object[]} [underConstructionEvents]
 */
export function findRegistrableEvent(slug, catalogEvents = [], underConstructionEvents = []) {
  if (!slug) return null
  return (
    catalogEvents.find((event) => event?.slug === slug) ??
    underConstructionEvents.find(
      (event) => event?.slug === slug && hiddenLandingTakesRegistrations(event),
    ) ??
    null
  )
}

/**
 * Catálogo + landings en construcción que venden inscripciones. Lo usan las
 * superficies donde alguien se inscribe (calendario, carril de la portada):
 * la venta puede abrir antes que la página oficial. Countdowns, destacados y
 * navegación de Competencia siguen leyendo `getPublicCatalogEvents`.
 *
 * Con la inscripción pausada en la plataforma una landing oculta no vende:
 * vuelve a quedar solo en el menú, con su aviso.
 *
 * @param {object[]} events catálogo crudo (incluye los stubs en construcción)
 * @param {{ now?: Date, registrationEnabled?: boolean }} [options]
 */
export function getRegistrableCatalogEvents(
  events = [],
  { now = new Date(), registrationEnabled = true } = {},
) {
  const catalog = getPublicCatalogEvents(events)
  if (!registrationEnabled) return catalog
  const selling = getUnderConstructionEvents(events).filter(
    (event) =>
      hiddenLandingTakesRegistrations(event, { now }) &&
      !catalog.some((item) => item.slug === event.slug),
  )
  return [...catalog, ...selling]
}

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
  return (Array.isArray(events) ? events : []).filter((event) => {
    if (!event || event.published === false || isPublicCatalogStubEvent(event)) return false

    // Una landing con el interruptor apagado se puede preparar con el evento ya
    // configurado: no aparece en listados ni countdowns (ver
    // `getUnderConstructionEvents` para el menú y la landing "en construcción").
    return !isUnderConstructionEvent(event)
  })
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
 * Slot 2: el siguiente meet publico vigente por fecha.
 * Un solo `featured` de staff; el segundo slot es derivado. Stubs y ocultos
 * no entran (mismo filtro que el catálogo público).
 */
export function getCompetitionNavEvents(events = [], now = new Date()) {
  const eligible = getPublicCatalogEvents(events).filter((event) => event.status !== 'finalizado')
  if (eligible.length === 0) return []

  const upcoming = getUpcomingEventsByDate(eligible, now)
  const featured = eligible.find((event) => event.featured)
  const first =
    featured && upcoming.some((event) => event.slug === featured.slug)
      ? featured
      : (upcoming[0] ?? null)
  if (!first) return []

  const remaining = upcoming.filter((event) => event.slug !== first.slug)
  const second = remaining[0] ?? null

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
 * Una landing en construcción que vende (`hiddenLandingTakesRegistrations`)
 * también ocupa el carril de inscripción: la venta puede abrir antes que la
 * página oficial. Entradas no, porque el catálogo no entrega sus datos.
 *
 * @param {object[]} [events]
 * @param {{
 *   now?: Date,
 *   registrationEnabled?: boolean,
 *   ticketSalesEnabled?: boolean,
 *   underConstructionEvents?: object[],
 * }} [options]
 * @returns {{ kind: 'tickets' | 'registration' | 'registration_soon', event: object }[]}
 */
export function getSeasonHomeActions(
  events = [],
  {
    now = new Date(),
    registrationEnabled = true,
    ticketSalesEnabled = true,
    underConstructionEvents = [],
  } = {},
) {
  const catalog = getPublicCatalogEvents(events)
  const registrable = getRegistrableCatalogEvents([...events, ...underConstructionEvents], {
    now,
    registrationEnabled,
  })
  const actions = []

  const ticketEvent =
    [getPitbullClassicEvent(catalog), ...catalog].find(
      (event) =>
        event &&
        canBuyEventTickets(event, { config: { ticketSalesEnabled }, now }),
    ) ?? null
  if (ticketEvent) {
    actions.push({ kind: 'tickets', event: ticketEvent })
  }

  const withPublicStatus = (event) => ({
    event,
    status: getPublicEventStatus(event, now, { registrationEnabled }),
  })

  const openForRegistration = registrable
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
  const upcomingTeasers = registrable
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
