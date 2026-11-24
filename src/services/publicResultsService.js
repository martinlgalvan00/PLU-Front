import { apiGet } from '../lib/api.js'

export function listPublishedMeetSlugs() {
  return apiGet('/api/events/results/published')
}

export function getPublicMeetSheet(slug) {
  return apiGet(`/api/events/${encodeURIComponent(slug)}/results/public`)
}
