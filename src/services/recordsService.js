/**
 * recordsService.js — PLU ARG
 *
 * Padrón público de mejores marcas. Hoy el padrón oficial está vacío
 * (sin mockear fixtures). Resultados sigue usando planillas publicadas.
 * Cuando exista fuente federativa, cablear buildRecordsRegisterFromMeets.
 */

import {
  inferDivisionGroup,
  inferDivisionSex,
  listPublishedEventResults,
} from './resultsService.js'

export const RECORD_LIFTS = Object.freeze(['squat', 'bench', 'deadlift', 'total'])

const GROUP_ORDER = Object.freeze(['open', 'youth', 'junior', 'sub-masters', 'masters', 'other'])
const SEX_ORDER = Object.freeze(['men', 'women', 'unknown'])

function parseWeightClass(name = '') {
  const match = String(name).match(/(-?\d+)\s*kg/i)
  return match ? `${match[1]} kg` : '—'
}

function parseEquipment(name = '') {
  const normalized = String(name).toLowerCase()
  if (
    normalized.includes('equipped') ||
    normalized.includes('single-ply') ||
    normalized.includes('multi-ply') ||
    normalized.includes('unlimited')
  ) {
    return 'Equipped'
  }
  if (normalized.includes('raw')) return 'Raw'
  return '—'
}

function formatMark(mark) {
  return Number.isInteger(mark) ? String(mark) : String(mark)
}

function weightClassSortValue(weightClass = '') {
  const match = String(weightClass).match(/-?\d+/)
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY
}

/**
 * Padrón público: vacío hasta fuente oficial (no deriva fixtures de Resultados).
 * @returns {{ entries: Array<object>, meetCount: number, sourceMeets: string[] }}
 */
export function buildRecordsRegister() {
  return {
    entries: [],
    meetCount: 0,
    sourceMeets: [],
  }
}

/**
 * Deriva mejores marcas desde planillas publicadas (helper para fuente oficial).
 * @param {Array<object>} [meets]
 * @returns {{
 *   entries: Array<{
 *     id: string
 *     lift: string
 *     mark: number
 *     markLabel: string
 *     athlete: string
 *     meet: string
 *     meetSlug: string
 *     category: string
 *     division: string
 *     sex: 'men' | 'women' | null
 *     group: string
 *     weightClass: string
 *     equipment: string
 *     dateISO: string
 *   }>
 *   meetCount: number
 *   sourceMeets: string[]
 * }}
 */
export function buildRecordsRegisterFromMeets(meets = listPublishedEventResults()) {
  const best = new Map()
  const sourceMeets = []

  for (const meet of meets) {
    if (meet?.eventTitle) sourceMeets.push(meet.eventTitle)

    for (const division of meet.divisions ?? []) {
      const sex = inferDivisionSex(division.name)
      const group = inferDivisionGroup(division.name)
      const weightClass = parseWeightClass(division.name)
      const equipment = parseEquipment(division.name)

      for (const lifter of division.lifters ?? []) {
        for (const lift of RECORD_LIFTS) {
          const mark = Number(lifter[lift])
          if (!Number.isFinite(mark) || mark <= 0) continue

          const key = [sex ?? 'unknown', group, weightClass, equipment, lift].join('|')
          const current = best.get(key)
          if (current && mark <= current.mark) continue

          best.set(key, {
            id: key,
            lift,
            mark,
            markLabel: `${formatMark(mark)} kg`,
            athlete: lifter.name,
            meet: meet.eventTitle,
            meetSlug: meet.slug,
            category: `${equipment} · ${weightClass}`,
            division: group,
            sex,
            group,
            weightClass,
            equipment,
            dateISO: meet.dateISO ?? '',
          })
        }
      }
    }
  }

  const entries = [...best.values()].sort((a, b) => {
    const sexDelta = SEX_ORDER.indexOf(a.sex ?? 'unknown') - SEX_ORDER.indexOf(b.sex ?? 'unknown')
    if (sexDelta !== 0) return sexDelta
    const groupDelta = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)
    if (groupDelta !== 0) return groupDelta
    const weightDelta = weightClassSortValue(a.weightClass) - weightClassSortValue(b.weightClass)
    if (weightDelta !== 0) return weightDelta
    const equipmentDelta = String(a.equipment).localeCompare(String(b.equipment), 'es')
    if (equipmentDelta !== 0) return equipmentDelta
    return RECORD_LIFTS.indexOf(a.lift) - RECORD_LIFTS.indexOf(b.lift)
  })

  return {
    entries,
    meetCount: sourceMeets.length,
    sourceMeets,
  }
}

export function getRecordsLiftFilters(t) {
  return [
    ['all', t('pages.records.filters.all')],
    ...RECORD_LIFTS.map((lift) => [lift, t(`pages.records.lifts.${lift}`)]),
  ]
}

export function getRecordsSexFilters(t) {
  return [
    ['all', t('pages.records.filters.sexAll')],
    ['men', t('pages.records.filters.sexMen')],
    ['women', t('pages.records.filters.sexWomen')],
  ]
}

export function getRecordsGroupFilters(t, entries = []) {
  const present = new Set(entries.map((entry) => entry.group).filter(Boolean))
  const groups = GROUP_ORDER.filter((group) => present.has(group))
  return [
    ['all', t('pages.records.filters.groupAll')],
    ...groups.map((group) => [group, t(`pages.results.divisionGroups.${group}`)]),
  ]
}

export function getRecordsEquipmentFilters(t, entries = []) {
  const present = [
    ...new Set(entries.map((entry) => entry.equipment).filter((value) => value && value !== '—')),
  ].sort((a, b) => a.localeCompare(b, 'es'))

  return [
    ['all', t('pages.records.filters.equipmentAll')],
    ...present.map((equipment) => [equipment, equipment]),
  ]
}

export function filterRecordsRegister(
  entries,
  { lift = 'all', sex = 'all', group = 'all', equipment = 'all', query = '' } = {},
) {
  const normalizedQuery = query.trim().toLowerCase()

  return entries.filter((entry) => {
    if (lift !== 'all' && entry.lift !== lift) return false
    if (sex !== 'all' && entry.sex !== sex) return false
    if (group !== 'all' && entry.group !== group) return false
    if (equipment !== 'all' && entry.equipment !== equipment) return false
    if (!normalizedQuery) return true

    const haystack =
      `${entry.athlete} ${entry.meet} ${entry.category} ${entry.division} ${entry.weightClass} ${entry.equipment}`.toLowerCase()
    return haystack.includes(normalizedQuery)
  })
}

/**
 * Agrupa como federación: sexo+división → clase de peso → equipamiento → filas por lift.
 */
export function groupRecordsFederated(entries = []) {
  const sections = []
  const sectionMap = new Map()

  for (const entry of entries) {
    const sectionKey = `${entry.sex ?? 'unknown'}|${entry.group}`
    let section = sectionMap.get(sectionKey)
    if (!section) {
      section = {
        id: sectionKey,
        sex: entry.sex,
        group: entry.group,
        classes: [],
        classMap: new Map(),
      }
      sectionMap.set(sectionKey, section)
      sections.push(section)
    }

    const classKey = `${entry.weightClass}|${entry.equipment}`
    let weightClassBlock = section.classMap.get(classKey)
    if (!weightClassBlock) {
      weightClassBlock = {
        id: `${sectionKey}|${classKey}`,
        weightClass: entry.weightClass,
        equipment: entry.equipment,
        lifts: Object.fromEntries(RECORD_LIFTS.map((lift) => [lift, null])),
      }
      section.classMap.set(classKey, weightClassBlock)
      section.classes.push(weightClassBlock)
    }
    weightClassBlock.lifts[entry.lift] = entry
  }

  for (const section of sections) {
    delete section.classMap
  }

  return sections
}

export function buildRecordsCsv(entries, t) {
  const header = [
    t('pages.records.exportColumns.sex'),
    t('pages.records.exportColumns.group'),
    t('pages.records.exportColumns.weightClass'),
    t('pages.records.exportColumns.equipment'),
    t('pages.records.exportColumns.lift'),
    t('pages.records.exportColumns.mark'),
    t('pages.records.exportColumns.athlete'),
    t('pages.records.exportColumns.meet'),
    t('pages.records.exportColumns.date'),
  ]

  const rows = entries.map((entry) => [
    entry.sex === 'women'
      ? t('pages.records.filters.sexWomen')
      : entry.sex === 'men'
        ? t('pages.records.filters.sexMen')
        : '—',
    t(`pages.results.divisionGroups.${entry.group}`),
    entry.weightClass,
    entry.equipment,
    t(`pages.records.lifts.${entry.lift}`),
    entry.markLabel,
    entry.athlete,
    entry.meet,
    entry.dateISO || '—',
  ])

  return [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
    .join('\n')
}

export function downloadRecordsCsv(csv, filename = 'plu-records.csv') {
  if (typeof document === 'undefined') return
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
