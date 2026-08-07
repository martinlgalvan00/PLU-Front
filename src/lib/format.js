export function money(value, locale = 'es') {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
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

export function formatDayMonth(iso, locale = 'es') {
  if (!iso) return ''
  const date = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return date
    .toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', { day: 'numeric', month: 'short' })
    .replace('.', '')
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
