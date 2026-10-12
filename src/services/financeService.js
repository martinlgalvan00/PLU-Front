import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api.js'

export function fetchFinanceReport({ from, to, query } = {}) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (query) params.set('query', query)
  return apiGet(`/api/finance?${params}`)
}

/** Asientos manuales: `expense` (egreso) o `income` (ingreso sin orden de pago). */
function entryPath(kind) {
  return kind === 'income' ? '/api/finance/incomes' : '/api/finance/expenses'
}

export function createEntry(kind, entry) {
  return apiPost(entryPath(kind), entry)
}

export function updateEntry(kind, id, entry) {
  return apiPatch(`${entryPath(kind)}/${id}`, entry)
}

export function deleteEntry(kind, id) {
  return apiDelete(`${entryPath(kind)}/${id}`)
}

/** Carga por lote (pegado desde Excel): `entries` lleva `kind` en cada fila. */
export function createEntries(entries) {
  return apiPost('/api/finance/entries/bulk', { entries })
}
