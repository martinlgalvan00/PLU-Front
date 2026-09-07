/**
 * Ventanas públicas de pesaje de un evento.
 * Independientes del `weighInAt` de cada tanda: acá se dice cuándo se puede
 * pesar; la tanda dice a qué hora pesa ese vuelo.
 */

export function generateWeighInWindowId() {
  return `weighin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function createEmptyWeighInWindow(overrides = {}) {
  return {
    id: generateWeighInWindowId(),
    label: '',
    date: '',
    startsAt: '',
    endsAt: '',
    note: '',
    sortOrder: 0,
    ...overrides,
  }
}

function toIsoLocalDateTime(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return raw.slice(0, 16)
  return raw
}

export function normalizeWeighInWindow(raw = {}, index = 0) {
  const startsAt = toIsoLocalDateTime(raw.startsAt ?? raw.starts_at)
  const endsAt = toIsoLocalDateTime(raw.endsAt ?? raw.ends_at)
  const dateRaw = String(raw.date ?? '').trim().slice(0, 10)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)
    ? dateRaw
    : startsAt.slice(0, 10) || ''

  return {
    id: String(raw.id ?? generateWeighInWindowId()),
    label: String(raw.label ?? '').trim(),
    date,
    startsAt,
    endsAt,
    note: String(raw.note ?? '').trim(),
    sortOrder: Number.isFinite(Number(raw.sortOrder ?? raw.sort_order))
      ? Number(raw.sortOrder ?? raw.sort_order)
      : index,
  }
}

export function normalizeWeighInWindows(windows) {
  if (!Array.isArray(windows)) return []
  return windows
    .map((window, index) => normalizeWeighInWindow(window, index))
    .filter((window) => window.label && window.startsAt && window.endsAt)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.startsAt.localeCompare(b.startsAt))
}

export function weighInWindowToForm(window = {}, index = 0) {
  const normalized = normalizeWeighInWindow(window, index)
  return {
    id: normalized.id,
    label: normalized.label,
    date: normalized.date,
    startTime: normalized.startsAt.includes('T') ? normalized.startsAt.slice(11, 16) : '',
    endTime: normalized.endsAt.includes('T') ? normalized.endsAt.slice(11, 16) : '',
    note: normalized.note,
  }
}

export function weighInWindowFromForm(form = {}, index = 0) {
  const date = String(form.date ?? '').trim().slice(0, 10)
  const startTime = String(form.startTime ?? '').trim().slice(0, 5)
  const endTime = String(form.endTime ?? '').trim().slice(0, 5)
  return normalizeWeighInWindow(
    {
      id: form.id,
      label: form.label,
      date,
      startsAt: date && startTime ? `${date}T${startTime}` : '',
      endsAt: date && endTime ? `${date}T${endTime}` : '',
      note: form.note,
      sortOrder: index,
    },
    index,
  )
}

function toFormWindow(window, index) {
  if (window?.startTime != null || window?.endTime != null) {
    return {
      id: window.id,
      label: window.label ?? '',
      date: window.date ?? '',
      startTime: window.startTime ?? '',
      endTime: window.endTime ?? '',
      note: window.note ?? '',
    }
  }
  return weighInWindowToForm(window, index)
}

export const DEFAULT_PUBLIC_WEIGH_IN_START = '08:00'
export const DEFAULT_PUBLIC_WEIGH_IN_END = '10:00'

/**
 * Completa franjas faltantes a partir de los días del meet.
 * No pisa fechas que ya tienen una ventana: el viernes de Pitbull (mañana y
 * tarde) se arma agregando la segunda fila a mano.
 */
export function suggestWeighInWindowsFromDays(days, existing = []) {
  const forms = (existing ?? []).map((window, index) => toFormWindow(window, index))
  const takenDates = new Set(forms.map((window) => window.date).filter(Boolean))
  const next = [...forms]

  for (const day of days ?? []) {
    const date = String(day?.date ?? '').trim().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || takenDates.has(date)) continue
    takenDates.add(date)
    const label = String(day.label ?? '').trim() || date
    next.push(
      weighInWindowToForm(
        createEmptyWeighInWindow({
          label,
          date,
          startsAt: `${date}T${DEFAULT_PUBLIC_WEIGH_IN_START}`,
          endsAt: `${date}T${DEFAULT_PUBLIC_WEIGH_IN_END}`,
        }),
        next.length,
      ),
    )
  }

  return next
}

export function weighInWindowsNeedDayPrefill(days, existing = []) {
  return suggestWeighInWindowsFromDays(days, existing).length > (existing?.length ?? 0)
}

/**
 * Fecha de un día de pesaje, legible y sin sorpresas de zona.
 *
 * `date` es `YYYY-MM-DD` de pared, así que se arma la fecha en UTC y se
 * formatea en UTC: pasarla por `new Date('2026-11-14')` la corre un día para
 * atrás en cualquier huso al oeste de Greenwich, que es donde está el país.
 */
export function formatWeighInDay(date, locale = 'es') {
  const match = String(date ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''
  const [, year, month, day] = match
  const value = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (Number.isNaN(value.getTime())) return ''
  const tag = locale?.startsWith('en') ? 'en-GB' : 'es-AR'
  return new Intl.DateTimeFormat(tag, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(value)
}

/**
 * Agrupa franjas del mismo día para el sitio público.
 *
 * `dayLabel` es la fecha formateada y es la que manda como encabezado: antes
 * el público veía solo `label`, así que un "Viernes mañana" mal escrito -- o
 * un label que no nombraba el día -- dejaba al atleta sin saber cuándo se
 * pesaba. Los labels editoriales pasan a acompañar cada franja, que además
 * arregla el caso de dos franjas el mismo día: antes ganaba el label de la
 * primera y la segunda quedaba sin nombre.
 */
export function groupWeighInWindowsByDay(windows, locale = 'es') {
  const groups = []
  const byKey = new Map()

  for (const window of normalizeWeighInWindows(windows)) {
    const key = window.date || window.label
    if (!byKey.has(key)) {
      const group = {
        key,
        date: window.date,
        dayLabel: formatWeighInDay(window.date, locale),
        label: window.label,
        notes: [],
        slots: [],
      }
      byKey.set(key, group)
      groups.push(group)
    }
    const group = byKey.get(key)
    group.slots.push(window)
    if (window.note && !group.notes.includes(window.note)) {
      group.notes.push(window.note)
    }
  }

  return groups
}

export function formatWeighInSlotRange(window, locale = 'es') {
  const start = formatClock(window?.startsAt, locale)
  const end = formatClock(window?.endsAt, locale)
  if (start && end) return `${start} — ${end}`
  return start || end || ''
}

function formatClock(iso, locale) {
  if (!iso) return ''
  const value = String(iso)
  // datetime-local del panel es hora de pared, sin zona: no pasar por Date()
  // porque un ISO sin offset se interpreta distinto según el motor.
  const embedded = value.match(/T(\d{2}:\d{2})/)
  if (embedded) return embedded[1]
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const tag = locale?.startsWith('en') ? 'en-GB' : 'es-AR'
  return date.toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit', hour12: false })
}
