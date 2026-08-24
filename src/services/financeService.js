import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api.js'

export function fetchFinanceReport({ from, to, query } = {}) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (query) params.set('query', query)
  return apiGet(`/api/finance?${params}`)
}

export function createExpense(expense) {
  return apiPost('/api/finance/expenses', expense)
}

export function updateExpense(id, expense) {
  return apiPatch(`/api/finance/expenses/${id}`, expense)
}

export function deleteExpense(id) {
  return apiDelete(`/api/finance/expenses/${id}`)
}
