import { UPCOMING_EVENTS } from '../lib/events.js'

import springClassic2025 from '../data/results/spring-classic-2025.json'

/** Slugs with published results (mock until backend integration). */
const PUBLISHED_RESULT_SLUGS = new Set(['spring-classic-2025'])

const EVENT_RESULTS_BY_SLUG = {
  'spring-classic-2025': springClassic2025,
}

export function getResultsFilters(t) {
  return [
    ['all', t('pages.results.filters.all'), t('pages.results.filters.allShort')],
    ['published', t('pages.results.filters.published'), t('pages.results.filters.publishedShort')],
    ['pending', t('pages.results.filters.pending'), t('pages.results.filters.pendingShort')],
  ]
}

export function getResultsSorts(t) {
  return [
    ['recent', t('pages.results.sorts.recent'), t('pages.results.sorts.recentShort')],
    ['oldest', t('pages.results.sorts.oldest'), t('pages.results.sorts.oldestShort')],
    ['name', t('pages.results.sorts.name'), t('pages.results.sorts.nameShort')],
  ]
}

export function getResultsFilterLabels(t) {
  return {
    all: t('pages.results.filterLabels.all'),
    published: t('pages.results.filterLabels.published'),
    pending: t('pages.results.filterLabels.pending'),
  }
}

/** @deprecated use getResultsFilters(t) */
export const RESULTS_FILTERS = [
  ['all', 'Todos', 'Todos'],
  ['published', 'Publicados', 'Pub.'],
  ['pending', 'En espera', 'Espera'],
]

/** @deprecated use getResultsSorts(t) */
export const RESULTS_SORTS = [
  ['recent', 'Más recientes', 'Recientes'],
  ['oldest', 'Más antiguos', 'Antiguos'],
  ['name', 'A → Z', 'A → Z'],
]

/** @deprecated use getResultsFilterLabels(t) */
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

export function getEventResults(slug) {
  return EVENT_RESULTS_BY_SLUG[slug] ?? null
}

export function hasEventResults(slug) {
  return Boolean(EVENT_RESULTS_BY_SLUG[slug])
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

export function sortResultsArchive(entries, sort = 'recent', locale = 'es') {
  const list = [...entries]
  const collator = locale === 'en' ? 'en' : 'es'

  if (sort === 'name') {
    return list.sort((a, b) => a.title.localeCompare(b.title, collator))
  }

  if (sort === 'oldest') {
    return list.sort((a, b) => a.dateISO.localeCompare(b.dateISO))
  }

  return list.sort((a, b) => b.dateISO.localeCompare(a.dateISO))
}

/** Sex inferred from division label: 'men' | 'women' | null */
export function inferDivisionSex(name = '') {
  const normalized = String(name).toLowerCase()
  if (normalized.includes('mujeres') || normalized.includes('women') || normalized.includes(' female')) {
    return 'women'
  }
  if (normalized.includes('hombres') || normalized.includes(' men') || normalized.endsWith(' men') || /\bmen\b/.test(normalized)) {
    return 'men'
  }
  return null
}

/** Age/equipment class group from division label. */
export function inferDivisionGroup(name = '') {
  const normalized = String(name).toLowerCase()
  if (normalized.includes('sub-junior') || normalized.includes('sub junior') || normalized.includes('subjunior')) {
    return 'sub-junior'
  }
  if (normalized.includes('junior')) return 'junior'
  if (normalized.includes('master')) return 'master'
  if (normalized.includes('open')) return 'open'
  return 'other'
}

export function shortenDivisionLabel(name = '') {
  return name
    .replace(/\s*·\s*/g, ' ')
    .replace(/\bHombres\b/gi, 'M')
    .replace(/\bMujeres\b/gi, 'F')
    .replace(/\bMen\b/gi, 'M')
    .replace(/\bWomen\b/gi, 'F')
    .replace(/\bRaw\b/gi, 'Raw')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildDivisionNav(divisions = []) {
  return divisions.map((division, index) => ({
    id: `div-${index}`,
    name: division.name,
    shortLabel: shortenDivisionLabel(division.name),
    sex: inferDivisionSex(division.name),
    group: inferDivisionGroup(division.name),
    lifterCount: division.lifters?.length ?? 0,
    division,
  }))
}

export function getDivisionSexOptions(navItems, t) {
  const hasMen = navItems.some((item) => item.sex === 'men')
  const hasWomen = navItems.some((item) => item.sex === 'women')
  if (!hasMen || !hasWomen) return null

  return [
    ['all', t('pages.results.divisionSexAll')],
    ['men', t('pages.results.divisionSexMen')],
    ['women', t('pages.results.divisionSexWomen')],
  ]
}

const DIVISION_GROUP_ORDER = ['open', 'junior', 'sub-junior', 'master', 'other']

export function getDivisionGroupOptions(navItems, t) {
  const present = new Set(navItems.map((item) => item.group).filter(Boolean))
  const groups = DIVISION_GROUP_ORDER.filter((group) => present.has(group))
  if (groups.length < 2) return null

  return [
    ['all', t('pages.results.divisionGroupAll')],
    ...groups.map((group) => [group, t(`pages.results.divisionGroups.${group}`)]),
  ]
}

export function filterDivisionNav(navItems, { sex = 'all', group = 'all', divisionId = 'all' } = {}) {
  return navItems.filter((item) => {
    if (sex !== 'all' && item.sex && item.sex !== sex) return false
    if (group !== 'all' && item.group !== group) return false
    if (divisionId !== 'all' && item.id !== divisionId) return false
    return true
  })
}
