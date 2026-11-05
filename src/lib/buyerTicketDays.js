import { calendarDateInTimeZone } from './format.js'
import { addCalendarDay } from './ticketValidityPolicy.js'

const ARGENTINA_TZ = 'America/Argentina/Buenos_Aires'
const MAX_WINDOW_DAYS = 31

function cleanDate(value) {
  const text = String(value ?? '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function cleanDayIndex(value) {
  return Number.isInteger(value) ? value : null
}

/**
 * Jornadas de una fila de lookup (embed de Supabase) a una lista estable.
 * `valid_until` no entra acá: eso lo resuelve el fallback de la ventana.
 */
export function lookupTicketAccessDays(ticket) {
  const type = ticket?.ticket_types ?? null
  const links = type?.ticket_type_days
  const days = []
  for (const link of Array.isArray(links) ? links : []) {
    const embedded = link?.event_days ?? link?.eventDays ?? null
    const rows = Array.isArray(embedded) ? embedded : embedded ? [embedded] : []
    for (const day of rows) {
      const label = String(day?.label ?? '').trim()
      const date = cleanDate(day?.date)
      const dayIndex = cleanDayIndex(day?.day_index ?? day?.dayIndex)
      if (!label && !date) continue
      days.push({ label, date: date || null, day_index: dayIndex })
    }
  }
  return days.sort((a, b) => {
    if (a.day_index != null && b.day_index != null) return a.day_index - b.day_index
    if (a.date && b.date) return a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    return a.label.localeCompare(b.label, 'es')
  })
}

function asAccessDay(raw) {
  if (!raw || typeof raw !== 'object') return null
  const label = String(raw.label ?? '').trim()
  const date = cleanDate(raw.date)
  const dayIndex = cleanDayIndex(raw.dayIndex ?? raw.day_index)
  const key = date || (dayIndex != null ? `day-${dayIndex}` : label)
  if (!key) return null
  return { label, date, dayIndex, key }
}

/** Lista de jornadas sin duplicados, ordenada por fecha o índice. */
export function normalizeAccessDays(days) {
  const seen = new Set()
  const normalized = []
  for (const raw of Array.isArray(days) ? days : []) {
    const day = asAccessDay(raw)
    if (!day || seen.has(day.key)) continue
    seen.add(day.key)
    normalized.push(day)
  }
  return normalized.sort((a, b) => {
    if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1
    if (a.dayIndex != null && b.dayIndex != null && a.dayIndex !== b.dayIndex) {
      return a.dayIndex - b.dayIndex
    }
    return a.label.localeCompare(b.label, 'es')
  })
}

function catalogDaysForTicket(ticket, catalogTypes) {
  const typeId = ticket?.ticketTypeId
  if (!typeId) return []
  const type = (Array.isArray(catalogTypes) ? catalogTypes : []).find((item) => item?.id === typeId)
  return normalizeAccessDays(type?.accessDays)
}

/**
 * Días de calendario que cubre la ventana congelada.
 * `validUntil` es exclusivo: un pase del día 15 que vence al empezar el 16
 * no incluye el 16.
 */
export function accessDaysFromValidityWindow(ticket) {
  const start = calendarDateInTimeZone(ticket?.validFrom ?? ticket?.valid_from, ARGENTINA_TZ)
  const endExclusive = calendarDateInTimeZone(ticket?.validUntil ?? ticket?.valid_until, ARGENTINA_TZ)
  if (!start || !endExclusive || endExclusive <= start) return []
  const days = []
  let cursor = start
  while (cursor && cursor < endExclusive && days.length < MAX_WINDOW_DAYS) {
    days.push({ label: '', date: cursor, dayIndex: null, key: cursor })
    cursor = addCalendarDay(cursor)
  }
  return days
}

/**
 * Jornadas que el comprador puede leer. El catálogo (o las jornadas que
 * vinieron con la entrada) manda. Si ya no están, queda la ventana congelada.
 */
export function describeBuyerTicketDays(ticket, { locale = 'es', catalogTypes = [] } = {}) {
  const assigned = normalizeAccessDays(ticket?.accessDays)
  const fromCatalog = assigned.length ? [] : catalogDaysForTicket(ticket, catalogTypes)
  const fromWindow =
    assigned.length || fromCatalog.length ? [] : accessDaysFromValidityWindow(ticket)
  const days = assigned.length ? assigned : fromCatalog.length ? fromCatalog : fromWindow
  const source = assigned.length
    ? 'ticket'
    : fromCatalog.length
      ? 'catalog'
      : fromWindow.length
        ? 'window'
        : 'none'
  return {
    source,
    days,
    label: days.map((day) => formatAccessDayLabel(day, locale)).filter(Boolean).join(' · '),
  }
}

/**
 * Línea corta para la fila de la cuenta. Un solo día conserva su nombre.
 * Varios días muestran la fecha: el tipo de entrada ya dice que son dos.
 */
export function compactAccessDaysLabel(described, locale = 'es') {
  const days = described?.days ?? []
  if (!days.length) return ''
  if (days.length === 1) return formatAccessDayLabel(days[0], locale)
  return days
    .map((day) => (day.date ? formatAccessDayDate(day.date, locale) : String(day.label ?? '').trim()))
    .filter(Boolean)
    .join(' · ')
}

export function formatAccessDayLabel(day, locale = 'es') {
  const dateLabel = day?.date ? formatAccessDayDate(day.date, locale) : ''
  const label = String(day?.label ?? '').trim()
  if (label && dateLabel) return `${label} · ${dateLabel}`
  return label || dateLabel
}

function formatAccessDayDate(isoDate, locale) {
  // Mediodía en Argentina, para que el día de semana no dependa del huso del cliente.
  const date = new Date(`${isoDate}T15:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return ''
  return date
    .toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: ARGENTINA_TZ,
    })
    .replace(/\./g, '')
}

/** Chips de jornada para una compra que mezcla días. Una entrada de dos días no se duplica. */
export function collectBuyerTicketDayFilters(tickets, options = {}) {
  const seen = new Map()
  for (const ticket of tickets ?? []) {
    for (const day of describeBuyerTicketDays(ticket, options).days) {
      if (!seen.has(day.key)) seen.set(day.key, formatAccessDayLabel(day, options.locale))
    }
  }
  return [...seen.entries()].map(([key, label]) => ({ key, label }))
}
