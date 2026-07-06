/**
 * calendar.js — PLU ARG
 *
 * "Agregar a mi calendario" por evento: link a Google Calendar + descarga
 * de un .ics individual. Ambas son funciones puras sobre los datos del
 * evento — no hay sincronización con ningún backend.
 *
 * Espera un evento con `startsAt`/`endsAt` (ISO 8601, con hora) — no
 * alcanza con la fecha sola porque un evento de varios días (ej. Pitbull
 * Classic 12-13 dic) necesita un DTEND real para que el calendario del
 * usuario no lo dibuje como un evento de un día.
 */

function toUtcCompact(dateInput) {
  const date = new Date(dateInput)
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function escapeIcsText(value = '') {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function buildEventLocation(event) {
  return [event.venue, event.location].filter(Boolean).join(', ')
}

export function buildGoogleCalendarUrl(event) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title ?? '',
    dates: `${toUtcCompact(event.startsAt)}/${toUtcCompact(event.endsAt)}`,
    details: event.description ?? '',
    location: buildEventLocation(event),
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function buildIcsContent(event) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PLU ARG//Eventos//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.slug ?? event.id ?? crypto.randomUUID()}@pluarg.com`,
    `DTSTAMP:${toUtcCompact(new Date())}`,
    `DTSTART:${toUtcCompact(event.startsAt)}`,
    `DTEND:${toUtcCompact(event.endsAt)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `LOCATION:${escapeIcsText(buildEventLocation(event))}`,
  ]

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`)
  }

  lines.push('END:VEVENT', 'END:VCALENDAR')

  // El salto de línea de un .ics debe ser CRLF por spec (RFC 5545).
  return lines.join('\r\n')
}

export function buildIcsBlob(event) {
  return new Blob([buildIcsContent(event)], { type: 'text/calendar;charset=utf-8' })
}

// `event.slug` ya es url-safe (se genera una sola vez, en eventAdminService.js)
// asi que acá solo hace falta un fallback minimo, sin re-derivar el slug.
export function buildIcsFilename(event) {
  const safeSlug = (event.slug ?? 'evento').toLowerCase().replace(/[^a-z0-9-]+/g, '-')
  return `${safeSlug}.ics`
}

export function downloadIcs(event) {
  const blob = buildIcsBlob(event)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = buildIcsFilename(event)
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
