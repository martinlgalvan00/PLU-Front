/**
 * Evento sobre el que trabaja la puerta cuando la sesión no llega por
 * `/evento/:slug/seguridad` (cuenta de seguridad que entra por el panel).
 *
 * Antes era siempre `pitbull-classic-2026`: una cuenta asignada a otro evento
 * escaneaba contra la lista equivocada. Orden: el evento asignado a la cuenta,
 * el que está en curso, el próximo y, sin fechas, el primero de la lista.
 */
const DAY_MS = 86_400_000

function time(value) {
  const parsed = value ? new Date(value).getTime() : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

export function resolveCheckinEvent(session, events = [], now = new Date()) {
  const list = Array.isArray(events) ? events.filter((event) => event?.slug) : []
  const assigned = session?.eventSlug ?? null
  if (assigned) {
    return list.find((event) => event.slug === assigned) ?? { slug: assigned }
  }
  if (session?.eventId) {
    const byId = list.find((event) => event.id === session.eventId)
    if (byId) return byId
  }

  const nowMs = now.getTime()
  // Un evento sigue "en curso" hasta el final de su último día.
  const endOf = (event) => time(event.endsAt) ?? (time(event.startsAt) ?? 0) + DAY_MS
  const upcoming = list
    .filter((event) => time(event.startsAt) != null && endOf(event) >= nowMs)
    .sort((a, b) => time(a.startsAt) - time(b.startsAt))
  return upcoming[0] ?? list[0] ?? null
}
