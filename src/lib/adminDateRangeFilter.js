/**
 * Match inclusive de un ISO datetime/date contra un rango `{ from, to }`
 * en formato `YYYY-MM-DD` (inputs nativos `type="date"`).
 *
 * Sin extremos activos → siempre true.
 * Con rango activo y sin fecha en el registro → false.
 *
 * @param {string|null|undefined} isoDate
 * @param {{ from?: string, to?: string }|null|undefined} range
 * @returns {boolean}
 */
export function matchesDateRange(isoDate, range) {
  if (!range?.from && !range?.to) return true
  if (!isoDate) return false
  const createdDate = String(isoDate).slice(0, 10)
  if (range.from && createdDate < range.from) return false
  if (range.to && createdDate > range.to) return false
  return true
}

/** Valor neutro para filtros `variant: 'dateRange'`. */
export const EMPTY_DATE_RANGE = Object.freeze({ from: '', to: '' })

/** `Date` local → `YYYY-MM-DD` (sin UTC shift). */
export function toLocalISODate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Presets operativos para el popover de rango.
 * @param {'last7'|'last30'|'thisMonth'} id
 * @param {Date} [now]
 * @returns {{ from: string, to: string }}
 */
export function dateRangePreset(id, now = new Date()) {
  const to = toLocalISODate(now)
  if (id === 'last7') {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
    return { from: toLocalISODate(from), to }
  }
  if (id === 'last30') {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)
    return { from: toLocalISODate(from), to }
  }
  if (id === 'thisMonth') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: toLocalISODate(from), to }
  }
  return { from: '', to: '' }
}

/** Detecta si el rango coincide exactamente con un preset. */
export function activeDateRangePresetId(range, now = new Date()) {
  if (!range?.from || !range?.to) return null
  for (const id of /** @type {const} */ (['last7', 'last30', 'thisMonth'])) {
    const preset = dateRangePreset(id, now)
    if (preset.from === range.from && preset.to === range.to) return id
  }
  return null
}
