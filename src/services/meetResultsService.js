import { apiGet, apiPost } from '../lib/api.js'

export function getEventResults(slug) {
  return apiGet(`/api/events/${encodeURIComponent(slug)}/results`)
}

export function importEventResults(slug, { csv, apply = false }) {
  return apiPost(`/api/events/${encodeURIComponent(slug)}/results/import`, { csv, apply })
}
