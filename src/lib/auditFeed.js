import { presentAuditEvent } from './auditPresentation.js'

/**
 * auditFeed.js — PLU ARG
 *
 * Lo que hace falta para leer la bitácora como una línea de tiempo y no como
 * una tabla: agrupar por día, resumir cada evento en una frase y dar formato a
 * los datos que acompañan. No decide qué es un incidente (eso vive en
 * `auditService.js`) ni arma el texto de las fallas (`auditPresentation.js`).
 */

const DEFAULT_LOCALE = 'es-AR'

function pad(value) {
  return String(value).padStart(2, '0')
}

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Día calendario en la zona del navegador (`YYYY-MM-DD`), o `null` si no es fecha. */
export function localDayKey(value) {
  const date = asDate(value)
  if (!date) return null
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Agrupa por día conservando el orden de llegada: la bitácora ya viene de más
 * nueva a más vieja y "Cargar más" agrega al final, así que reordenar acá
 * podría mezclar páginas.
 */
export function groupAuditEntriesByDay(entries = [], now = new Date()) {
  const todayKey = localDayKey(now)
  const reference = asDate(now) ?? new Date()
  const yesterdayKey = localDayKey(
    new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() - 1),
  )

  const groups = []
  const byKey = new Map()

  for (const entry of entries) {
    const key = localDayKey(entry.createdAt) ?? 'unknown'
    let group = byKey.get(key)
    if (!group) {
      const kind =
        key === 'unknown'
          ? 'unknown'
          : key === todayKey
            ? 'today'
            : key === yesterdayKey
              ? 'yesterday'
              : 'date'
      group = { key, kind, date: key === 'unknown' ? null : asDate(entry.createdAt), entries: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.entries.push(entry)
  }

  return groups
}

/** "Hoy" / "Ayer" / "miércoles 8 de octubre" (con año si no es el actual). */
export function formatAuditDayLabel(
  group,
  { today, yesterday, unknown = '—', locale = DEFAULT_LOCALE, now = new Date() } = {},
) {
  if (group.kind === 'today') return today
  if (group.kind === 'yesterday') return yesterday
  if (!group.date) return unknown

  const sameYear = group.date.getFullYear() === (asDate(now) ?? new Date()).getFullYear()
  const label = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(group.date)
  // Sólo la primera letra: `text-transform: capitalize` también mayusculizaría
  // la preposición ("9 De Octubre").
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function formatAuditTime(value, locale = DEFAULT_LOCALE) {
  const date = asDate(value)
  if (!date) return '—'
  // 24 h: "02:03 p. m." se parte en dos líneas en la columna angosta de la hora.
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

export function formatAuditFactValue(field, value, locale = DEFAULT_LOCALE) {
  if (field === 'amount' && Number.isFinite(Number(value))) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(Number(value))
  }
  if (field === 'nextRetryAt') {
    const date = asDate(value)
    if (date) {
      return new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(date)
    }
  }
  return String(value)
}

/**
 * Una frase por evento: el motivo si falló o, si no, los dos o tres datos que
 * identifican la operación (referencia, monto, código). Los ids técnicos
 * quedan para el detalle del evento.
 */
export function summarizeAuditEntry(row, { limit = 3, locale = DEFAULT_LOCALE } = {}) {
  const { lead, facts } = presentAuditEvent(row)
  const cap = lead ? Math.min(limit, 2) : limit

  return {
    lead: lead || null,
    facts: facts.slice(0, cap).map(({ field, value }) => ({
      field,
      value: formatAuditFactValue(field, value, locale),
    })),
  }
}
