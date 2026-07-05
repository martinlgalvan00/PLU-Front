import { UPCOMING_EVENTS } from '../lib/events.js'

/** Slugs con resultados ya publicados (mock hasta integrar backend). */
const PUBLISHED_RESULT_SLUGS = new Set(['spring-classic-2025'])

export const RESULTS_FILTERS = [
  ['all', 'Todos'],
  ['published', 'Publicados'],
  ['pending', 'En espera'],
]

export const RESULTS_SORTS = [
  ['recent', 'Más recientes'],
  ['oldest', 'Más antiguos'],
  ['name', 'A → Z'],
]

export const RESULTS_FILTER_LABELS = {
  all: 'en el archivo',
  published: 'publicados',
  pending: 'en espera',
}

export function getResultsArchive(events = UPCOMING_EVENTS) {
  return events.map((event) => ({
    ...event,
    resultsStatus: PUBLISHED_RESULT_SLUGS.has(event.slug) ? 'published' : 'pending',
  }))
}

export function getResultsSummary(entries = getResultsArchive()) {
  const published = entries.filter((entry) => entry.resultsStatus === 'published').length
  const pending = entries.filter((entry) => entry.resultsStatus === 'pending').length

  return {
    published,
    pending,
    total: entries.length,
  }
}

export function filterResultsArchive(entries, { query = '', filter = 'all' } = {}) {
  const normalizedQuery = query.trim().toLowerCase()

  return entries.filter((entry) => {
    if (filter === 'published' && entry.resultsStatus !== 'published') return false
    if (filter === 'pending' && entry.resultsStatus !== 'pending') return false

    if (!normalizedQuery) return true

    const haystack = `${entry.title} ${entry.location} ${entry.venue} ${entry.date}`.toLowerCase()
    return haystack.includes(normalizedQuery)
  })
}

export function sortResultsArchive(entries, sort = 'recent') {
  const list = [...entries]

  if (sort === 'name') {
    return list.sort((a, b) => a.title.localeCompare(b.title, 'es'))
  }

  if (sort === 'oldest') {
    return list.sort((a, b) => a.dateISO.localeCompare(b.dateISO))
  }

  return list.sort((a, b) => b.dateISO.localeCompare(a.dateISO))
}
