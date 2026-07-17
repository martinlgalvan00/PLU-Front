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
  return events.find((event) => event.featured) ?? events[0] ?? null
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
