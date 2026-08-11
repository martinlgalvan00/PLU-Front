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
  return [...events]
    .filter((event) => event && event.status !== 'finalizado')
    .sort((a, b) => eventCreatedRank(b) - eventCreatedRank(a))[0] ?? null
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
    .filter((event) => event && event.status !== 'finalizado' && Number.isFinite(eventDateTime(event)))
    .sort((a, b) => eventDateTime(a) - eventDateTime(b) || eventCreatedRank(b) - eventCreatedRank(a))

  const upcoming = datedEvents.filter((event) => eventDateTime(event) >= todayTime)
  return upcoming.length ? upcoming : datedEvents
}

export function getNextUpcomingEvent(events = [], now = new Date()) {
  return getUpcomingEventsByDate(events, now)[0] ?? null
}

export function getFeaturedEvent(events = []) {
  // El destacado explícito manda (staff_upsert_event garantiza que hay a lo
  // sumo uno). Si no hay ninguno marcado, se cae al próximo por fecha en vez
  // de events[0], que dependía del orden arbitrario del fetch y podía promover
  // como "Pitbull" un evento cualquiera (incluso uno ya finalizado).
  return events.find((event) => event.featured) ?? getNextUpcomingEvent(events)
}

/**
 * Pitbull conserva su pagina editorial propia. Cualquier otro evento
 * destacado abre la ficha generica por slug; atar siempre el destacado a la
 * vista Pitbull hacia que un evento nuevo marcado desde el panel terminara en
 * la competencia equivocada.
 */
export function getFeaturedEventDestination(event) {
  if (!event?.slug) return { view: 'events', options: {} }
  if (event.slug === 'pitbull-classic-2026') return { view: 'pitbull', options: {} }
  return { view: 'events', options: { eventSlug: event.slug } }
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
