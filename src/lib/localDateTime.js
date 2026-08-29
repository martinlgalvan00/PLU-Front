/**
 * Fecha/hora local para inputs de admin.
 *
 * `datetime-local` pinta mes/día según el locale del sistema (en Windows en-US
 * queda 09/03). PLU habla es-AR: el valor canónico sigue siendo
 * `YYYY-MM-DDTHH:mm`; lo que cambia es cómo se lee y se tipea.
 */

const ISO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/

export function isDayFirstLocale(locale) {
  return locale !== 'en'
}

export function splitIsoLocal(value) {
  const match = String(value ?? '').match(ISO_LOCAL)
  if (!match) return null
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hours: Number(match[4]),
    minutes: Number(match[5]),
  }
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

export function formatDateText(parts, dayFirst) {
  if (!parts) return ''
  const day = pad2(parts.day)
  const month = pad2(parts.month)
  const year = String(parts.year)
  return dayFirst ? `${day}/${month}/${year}` : `${month}/${day}/${year}`
}

export function formatTimeText(parts) {
  if (!parts) return ''
  return `${pad2(parts.hours)}:${pad2(parts.minutes)}`
}

export function maskDateInput(raw) {
  const digits = String(raw ?? '')
    .replace(/\D/g, '')
    .slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

export function maskTimeInput(raw) {
  const digits = String(raw ?? '')
    .replace(/\D/g, '')
    .slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

function validDateParts(year, month, day) {
  if (!Number.isInteger(year) || year < 1990 || year > 2100) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const probe = new Date(year, month - 1, day)
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) {
    return null
  }
  return { year, month, day }
}

export function parseDateText(text, dayFirst) {
  const digits = String(text ?? '').replace(/\D/g, '')
  if (digits.length < 8) return null

  // Pegado ISO (`2026-09-15` / `20260915`): el año va primero y cae fuera del
  // rango día/mes, así que se intenta antes que dd/mm.
  const isoYear = Number(digits.slice(0, 4))
  if (isoYear >= 1990 && isoYear <= 2100) {
    const iso = validDateParts(isoYear, Number(digits.slice(4, 6)), Number(digits.slice(6, 8)))
    if (iso) return iso
  }

  const first = Number(digits.slice(0, 2))
  const second = Number(digits.slice(2, 4))
  const year = Number(digits.slice(4, 8))
  const day = dayFirst ? first : second
  const month = dayFirst ? second : first
  return validDateParts(year, month, day)
}

export function parseTimeText(text) {
  const digits = String(text ?? '').replace(/\D/g, '')
  if (digits.length < 3) return null
  const padded = digits.length === 3 ? `0${digits}` : digits.slice(0, 4)
  const hours = Number(padded.slice(0, 2))
  const minutes = Number(padded.slice(2, 4))
  if (hours > 23 || minutes > 59) return null
  return { hours, minutes }
}

export function toIsoLocal(dateParts, timeParts) {
  if (!dateParts || !timeParts) return ''
  return `${dateParts.year}-${pad2(dateParts.month)}-${pad2(dateParts.day)}T${pad2(timeParts.hours)}:${pad2(timeParts.minutes)}`
}

export function documentLangForLocale(locale) {
  return locale === 'en' ? 'en' : 'es-AR'
}
