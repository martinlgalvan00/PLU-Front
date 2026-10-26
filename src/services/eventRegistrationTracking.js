import { isRegistrationForEvent } from '../lib/athleteEventStatus.js'
import { paymentChannelOf } from '../lib/paymentProgress.js'
import { REGISTRATION_MODALITIES } from '../../shared/registrationSelection.js'
import {
  createRegistrationPaymentIndex,
  matchesRegistrationStatusFilter,
  resolveRegistrationPayment,
} from './registrationAdminService.js'

/**
 * Seguimiento de las inscripciones de un evento — PLU ARG
 *
 * Lo que el panel del evento necesita para responder "cuántos van, cuánto se
 * cobró y quiénes faltan" sin salir del meet: las filas con su pago, el
 * resumen, los conteos por división, categoría, modalidad y medio de pago, el
 * filtro combinado y las filas del CSV. Puro, sin I/O ni traducciones: la UI
 * pasa los textos.
 */

const CANCELLED = new Set(['cancelada', 'rechazado'])
const PENDING = new Set(['pendiente_pago', 'validacion_manual', 'borrador'])
const PAID_ORDER = 'aprobado'
const OPEN_ORDER = new Set(['pendiente', 'validacion_manual'])

export const EMPTY_TRACKING_FILTERS = Object.freeze({
  query: '',
  status: 'all',
  division: 'all',
  category: 'all',
  modality: 'all',
  channel: 'all',
})

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Divisiones en las que compite: la de edad (100%) y, si la hay, la segunda (50%). */
export function registrationDivisions(registration) {
  return [registration?.division, registration?.secondaryDivision].filter(Boolean)
}

/**
 * Inscripciones del evento con su atleta y su orden de pago.
 * @returns {Array<object>} filas con `athlete`, `payment`, `channel` y `amount`
 */
export function buildEventRegistrationRows({
  registrations = [],
  athletes = [],
  payments = [],
  event,
}) {
  if (!event) return []
  const athletesById = new Map(athletes.filter((item) => item?.id).map((item) => [item.id, item]))
  const index = createRegistrationPaymentIndex(payments)
  return registrations
    .filter((registration) => isRegistrationForEvent(registration, event))
    .map((registration) => {
      const payment = resolveRegistrationPayment(index, registration) ?? null
      return {
        ...registration,
        athlete: registration.athlete ?? athletesById.get(registration.athleteId) ?? null,
        payment,
        channel: payment ? paymentChannelOf(payment) : null,
        amount: payment ? Number(payment.amount) || 0 : null,
        currency: payment?.currency || 'ARS',
      }
    })
}

function addAmount(totals, currency, amount) {
  totals[currency] = (totals[currency] ?? 0) + amount
}

/**
 * Lo que se ve de un vistazo. Lo cobrado y lo pendiente se suman por moneda:
 * Wise cobra en USD y mezclarlo con pesos daría un total que no existe.
 */
export function summarizeEventRegistrations(rows = [], event = null) {
  const summary = {
    active: 0,
    confirmed: 0,
    pending: 0,
    observed: 0,
    cancelled: 0,
    capacity:
      Number(event?.slots ?? event?.capacity) > 0 ? Number(event.slots ?? event.capacity) : null,
    collected: {},
    outstanding: {},
  }
  for (const row of rows) {
    const status = String(row.status ?? '').toLowerCase()
    if (CANCELLED.has(status)) {
      summary.cancelled += 1
      continue
    }
    summary.active += 1
    if (status === 'confirmada' || status === 'pagada') summary.confirmed += 1
    else if (PENDING.has(status)) summary.pending += 1
    else if (status === 'observada') summary.observed += 1

    if (!row.payment) continue
    if (row.payment.status === PAID_ORDER) addAmount(summary.collected, row.currency, row.amount)
    else if (OPEN_ORDER.has(row.payment.status)) {
      addAmount(summary.outstanding, row.currency, row.amount)
    }
  }
  return summary
}

function bump(map, key) {
  if (!key) return
  map.set(key, (map.get(key) ?? 0) + 1)
}

/**
 * Conteos para los filtros, sobre las inscripciones vigentes. Quien compite en
 * dos divisiones cuenta en las dos: es lo que se necesita para armar las tandas.
 */
export function eventRegistrationFacets(rows = []) {
  const divisions = new Map()
  const categories = new Map()
  const modalities = new Map()
  const channels = new Map()
  let secondDivision = 0
  for (const row of rows) {
    if (CANCELLED.has(String(row.status ?? '').toLowerCase())) continue
    for (const division of registrationDivisions(row)) bump(divisions, division)
    if (row.secondaryDivision) secondDivision += 1
    bump(categories, row.category)
    for (const modality of row.modalities ?? []) bump(modalities, modality)
    bump(channels, row.channel)
  }
  const sorted = (map) => [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return {
    divisions: sorted(divisions),
    categories: sorted(categories),
    // El orden del catálogo, no el de la cantidad: Full Power primero.
    modalities: REGISTRATION_MODALITIES.filter((key) => modalities.has(key)).map((key) => [
      key,
      modalities.get(key),
    ]),
    channels: sorted(channels),
    secondDivision,
  }
}

/** Filtro combinado del panel (estado, división, categoría, modalidad, medio y texto). */
export function filterEventRegistrationRows(rows = [], filters = {}, gatePendingIds = new Set()) {
  const { query, status, division, category, modality, channel } = {
    ...EMPTY_TRACKING_FILTERS,
    ...filters,
  }
  const needle = normalizeText(query)
  return rows.filter((row) => {
    if (!matchesRegistrationStatusFilter(row, row.payment, status, gatePendingIds)) return false
    if (division !== 'all' && !registrationDivisions(row).includes(division)) return false
    if (category !== 'all' && row.category !== category) return false
    if (modality !== 'all' && !(row.modalities ?? []).includes(modality)) return false
    if (channel !== 'all' && row.channel !== channel) return false
    if (!needle) return true
    const haystack = normalizeText(
      [row.athlete?.fullName, row.athlete?.email, row.athlete?.documentId]
        .filter(Boolean)
        .join(' '),
    )
    return haystack.includes(needle)
  })
}

export function hasActiveTrackingFilters(filters = {}) {
  return Object.entries(EMPTY_TRACKING_FILTERS).some(
    ([key, empty]) => String(filters[key] ?? empty).trim() !== empty,
  )
}

/**
 * Una celda que empieza con `=`, `+`, `-` o `@` la ejecuta Excel como fórmula:
 * el nombre lo escribe el atleta, así que se neutraliza.
 */
function safeCell(value) {
  const text = String(value ?? '')
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
}

/**
 * Filas del CSV del evento. `labels` trae los encabezados y `format` traduce
 * estado, modalidad y medio (la UI le pasa `t`).
 */
export function eventRegistrationCsvRows(rows = [], { labels, format }) {
  return rows.map((row) => ({
    [labels.athlete]: safeCell(row.athlete?.fullName ?? ''),
    [labels.document]: safeCell(row.athlete?.documentId ?? ''),
    [labels.email]: safeCell(row.athlete?.email ?? ''),
    [labels.category]: safeCell(row.category ?? ''),
    [labels.division]: safeCell(row.division ?? ''),
    [labels.secondaryDivision]: safeCell(row.secondaryDivision ?? ''),
    [labels.modalities]: (row.modalities ?? []).map((key) => format.modality(key)).join(' + '),
    [labels.status]: format.status(row.status),
    [labels.channel]: row.channel ? format.channel(row.channel) : '',
    [labels.amount]: row.amount ?? '',
    [labels.currency]: row.payment ? row.currency : '',
    [labels.paymentStatus]: row.payment ? format.status(row.payment.status) : '',
    [labels.createdAt]: row.createdAt ? String(row.createdAt).slice(0, 10) : '',
  }))
}
