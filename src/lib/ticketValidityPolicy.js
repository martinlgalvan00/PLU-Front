/**
 * Políticas de acceso de un tipo de entrada.
 *
 * La duración se guarda siempre en minutos: evita ambigüedad entre UI, API y
 * PostgreSQL, y permite que el editor la presente en minutos, horas o días.
 */
export const TICKET_ACCESS_POLICY_MODE = Object.freeze({
  EVENT_DAYS: 'event_days',
  FIXED_WINDOW: 'fixed_window',
  FROM_PAYMENT: 'from_payment',
  FROM_FIRST_SCAN: 'from_first_scan',
})

export const TICKET_ACCESS_POLICY_MODES = Object.freeze(Object.values(TICKET_ACCESS_POLICY_MODE))

export function isTicketDurationValidityMode(mode) {
  return (
    mode === TICKET_ACCESS_POLICY_MODE.FROM_PAYMENT ||
    mode === TICKET_ACCESS_POLICY_MODE.FROM_FIRST_SCAN
  )
}

export const MAX_TICKET_ACCESS_DURATION_MINUTES = 366 * 24 * 60

/**
 * Una credencial sigue siendo un identificador único. Esta regla decide cómo
 * se consume el derecho de entrada que representa, no cuántos QR se emiten.
 */
export const TICKET_ACCESS_USAGE_MODE = Object.freeze({
  ONCE_TOTAL: 'once_total',
  ONCE_PER_EVENT_DAY: 'once_per_event_day',
})

export const TICKET_ACCESS_USAGE_MODES = Object.freeze(Object.values(TICKET_ACCESS_USAGE_MODE))

// Alias de transición para no romper integraciones que todavía importan el
// nombre anterior. La semántica pública ya es "acceso de entrada", no QR.
export const TICKET_QR_VALIDITY_MODE = TICKET_ACCESS_POLICY_MODE
export const TICKET_QR_VALIDITY_MODES = TICKET_ACCESS_POLICY_MODES
export const MAX_TICKET_QR_VALIDITY_MINUTES = MAX_TICKET_ACCESS_DURATION_MINUTES

const MINUTES_PER_HOUR = 60
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR

function asPositiveInteger(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return null
  return Math.round(number)
}

/** Suma un día de calendario a un `YYYY-MM-DD` sin pasar por la zona local. */
export function addCalendarDay(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate ?? '').trim())
  if (!match) return null
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1)
  return new Date(utc).toISOString().slice(0, 10)
}

/**
 * Cómo presentar una duración guardada en minutos. El editor y el resumen de
 * fila tienen que coincidir: 1440 no es "1440 minutos", es 1 día.
 */
export function ticketValidityDurationParts(minutes) {
  const value = asPositiveInteger(minutes)
  if (value == null) return null
  if (value % MINUTES_PER_DAY === 0) return { value: value / MINUTES_PER_DAY, unit: 'days' }
  if (value % MINUTES_PER_HOUR === 0) return { value: value / MINUTES_PER_HOUR, unit: 'hours' }
  return { value, unit: 'minutes' }
}

function selectedEventDays(dayIndexes, eventDays) {
  const wanted = new Set((Array.isArray(dayIndexes) ? dayIndexes : []).filter(Number.isInteger))
  return (Array.isArray(eventDays) ? eventDays : [])
    .filter((day) => wanted.has(day?.dayIndex))
    .sort((a, b) => a.dayIndex - b.dayIndex)
}

/**
 * Resumen de vigencia para el editor: sin copy, para que i18n viva en la UI.
 *
 * Para `event_days` el bound es calendario en Argentina: 00:00 del primer día
 * asignado hasta 00:00 del día posterior al último. No convierte a Date: el
 * SQL usa `date::timestamp at time zone 'America/Argentina/Buenos_Aires'`.
 */
export function summarizeTicketQrValidity(type = {}, eventDays = []) {
  const validityMode = TICKET_ACCESS_POLICY_MODES.includes(type?.validityMode)
    ? type.validityMode
    : TICKET_ACCESS_POLICY_MODE.EVENT_DAYS
  const accessUsageMode = TICKET_ACCESS_USAGE_MODES.includes(type?.accessUsageMode)
    ? type.accessUsageMode
    : TICKET_ACCESS_USAGE_MODE.ONCE_TOTAL

  const days = selectedEventDays(type?.dayIndexes, eventDays)
  const labels = days
    .map((day) => String(day.label || `#${day.dayIndex + 1}`).trim())
    .filter(Boolean)
  const dates = days
    .map((day) => String(day.date ?? '').trim())
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
  const firstDate = dates.length > 0 ? dates.reduce((min, date) => (date < min ? date : min)) : null
  const lastDate = dates.length > 0 ? dates.reduce((max, date) => (date > max ? date : max)) : null
  const untilDate = lastDate ? addCalendarDay(lastDate) : null
  const durationMinutes = asPositiveInteger(type?.validityDurationMinutes)
  const validFrom = String(type?.validFrom ?? '').trim() || null
  const validUntil = String(type?.validUntil ?? '').trim() || null
  const coversAllDays =
    days.length > 0 && days.length === (Array.isArray(eventDays) ? eventDays.length : 0)

  const base = {
    mode: validityMode,
    usage: accessUsageMode,
    dayCount: labels.length,
    labels,
    firstDate,
    lastDate,
    untilDate,
    coversAllDays,
    durationMinutes,
    validFrom,
    validUntil,
  }

  if (validityMode === TICKET_ACCESS_POLICY_MODE.FIXED_WINDOW) {
    if (!validFrom || !validUntil) {
      return { ...base, kind: 'missing' }
    }
    return { ...base, kind: 'fixed_window' }
  }

  if (isTicketDurationValidityMode(validityMode)) {
    if (durationMinutes == null) {
      return { ...base, kind: 'missing' }
    }
    return { ...base, kind: validityMode }
  }

  if (labels.length === 0) {
    return { ...base, kind: 'missing' }
  }

  return { ...base, kind: 'event_days' }
}
