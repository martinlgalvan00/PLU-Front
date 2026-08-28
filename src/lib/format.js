export function money(value, locale = 'es', currency = 'ARS') {
  const normalized = String(currency ?? 'ARS').toUpperCase()
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-AR', {
    style: 'currency',
    currency: normalized,
    // ARS no usa centavos en la práctica; USD/otras monedas sí.
    maximumFractionDigits: normalized === 'ARS' ? 0 : 2,
  }).format(value)
}

export function splitFullName(fullName) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts.at(-1),
  }
}

export function sessionDisplayName(session, { short = false } = {}) {
  if (!session) return ''

  const name = String(session.name ?? '').trim()
  if (name) {
    if (short) {
      const { firstName } = splitFullName(name)
      return firstName || name
    }
    return name
  }

  const email = String(session.email ?? '').trim()
  if (email) return email.split('@')[0]

  return 'Cuenta'
}

export function sessionInitial(session) {
  const label = sessionDisplayName(session, { short: true }) || sessionDisplayName(session)
  return label.charAt(0).toUpperCase() || '?'
}

export function sessionPhotoUrl(session) {
  if (!session) return ''
  const url = session.photoUrl ?? session.avatarUrl ?? session.picture ?? ''
  return String(url).trim()
}

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function formatShortDate(iso, locale = 'es') {
  if (!iso) return ''
  const date = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return date
    .toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .replace('.', '')
}

/**
 * Fecha corta de un timestamp COMPLETO, siempre en ART. `formatShortDate`
 * asume 'YYYY-MM-DD' (le agrega T12:00:00) y devuelve un timestamp crudo tal
 * cual; esta variante es para columnas timestamptz como `price_effective_at`,
 * donde la medianoche ART serializada en UTC no puede leerse como el día
 * anterior o siguiente.
 */
export function formatShortStamp(iso, locale = 'es') {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return String(iso)
  return date
    .toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'America/Argentina/Buenos_Aires',
    })
    .replace('.', '')
}

/**
 * Cierre comercial de una promo con día de la semana, siempre en ART.
 * 2026-08-28T23:59:59-03:00 y su equivalente UTC no pueden leerse como sábado 29.
 */
export function formatPromoDeadline(iso, locale = 'es') {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return String(iso)
  const label = date.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
  return locale === 'en' ? label : label.replace(',', '')
}

export function formatDayMonth(iso, locale = 'es') {
  if (!iso) return ''
  const date = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return date
    .toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', { day: 'numeric', month: 'short' })
    .replace('.', '')
}

/** Mes + año editorial (ej. "diciembre 2026") para grupos de calendario. */
export function formatMonthYear(isoOrYm, locale = 'es') {
  if (!isoOrYm) return ''
  const raw = String(isoOrYm).trim()
  const ym = raw.length >= 7 ? raw.slice(0, 7) : raw
  const date = new Date(`${ym}-01T12:00:00`)
  if (Number.isNaN(date.getTime())) return raw
  const label = date
    .toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
      month: 'long',
      year: 'numeric',
    })
    .replace('.', '')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/**
 * Abreviatura visual de códigos PLU-ARG-… para tablas densas.
 * El valor completo se muestra vía title/tooltip; no altera el código real.
 */
export function formatShortMemberCode(code, { keepTail = 8 } = {}) {
  const value = String(code ?? '').trim()
  if (!value) return ''
  if (value.length <= keepTail + 1) return value
  const segments = value.split('-').filter(Boolean)
  if (segments.length >= 2) {
    const tail = segments.slice(-2).join('-')
    if (tail.length <= keepTail + 4) return `…${tail}`
  }
  return `…${value.slice(-keepTail)}`
}

/** Tiempo relativo corto para listas live (inscriptos recientes). */
export function formatRelativeTime(iso, locale = 'es', now = Date.now()) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const diffMs = date.getTime() - now
  const absSeconds = Math.abs(Math.round(diffMs / 1000))
  const rtf = new Intl.RelativeTimeFormat(locale === 'en' ? 'en' : 'es', { numeric: 'auto' })

  if (absSeconds < 45) return locale === 'en' ? 'just now' : 'ahora'
  if (absSeconds < 3600) return rtf.format(Math.round(diffMs / 60_000), 'minute')
  if (absSeconds < 86_400) return rtf.format(Math.round(diffMs / 3_600_000), 'hour')
  if (absSeconds < 86_400 * 7) return rtf.format(Math.round(diffMs / 86_400_000), 'day')
  return formatShortDate(String(iso).slice(0, 10), locale)
}

export function generateId(prefix, index) {
  return `${prefix}-${String(index).padStart(3, '0')}`
}

/**
 * El operador de puerta coteja el número contra el documento físico: decirle
 * qué tipo esperar (DNI para el padrón argentino, ID/pasaporte para el resto)
 * evita pedirle un DNI a un extranjero. El tipo se infiere del formato: el
 * registro solo acepta 7 u 8 dígitos como DNI.
 */
export function documentKind(documentId) {
  const value = String(documentId ?? '').trim()
  if (!value) return ''
  return /^\d{7,8}$/.test(value.replace(/[.\-\s]/g, '')) ? 'DNI' : 'ID'
}

export function formatDocumentWithKind(documentId) {
  const value = String(documentId ?? '').trim()
  if (!value) return ''
  return `${documentKind(value)} ${value}`
}
