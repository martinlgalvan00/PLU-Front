/**
 * Export Lifters (estilo LiftingCast) + completitud para avisos de perfil.
 */

import {
  referenceDateForExport,
  resolveDivisionExportFields,
  todayCalendarDate,
} from './ageDivision.js'
import { normalizeDivision, normalizeEquipment, normalizeGender } from './competitionLexicon.js'
import {
  formatDeclaredBodyWeight,
  formatExportDateDmy,
  normalizeExportDate,
  serializeSpreadsheet,
} from './exportRows.js'
import {
  competitionBodyweight,
  competitionWeightClass,
  getWeightClassWarning,
  isDeclaredWeightClassForSex,
} from './pluWeightClasses.js'

/** Campos que pedimos para una planilla Lifters usable. */
export const REQUIRED_FOR_LIFTERS_EXPORT = Object.freeze([
  'fullName',
  'birthDate',
  'sex',
  'gym',
  'country',
  'province',
  'city',
  'streetAddress',
  'postalCode',
  'email',
  'phone',
  'category',
  'emergencyContactName',
  'emergencyContactPhone',
])

/**
 * Campos que un aviso de perfil puede pedir (inscripción + lifters).
 * La inscripción sigue gated por REQUIRED_FOR_REGISTRATION.
 */
export const REQUIRED_FOR_PROFILE_NOTICE = Object.freeze([
  'phone',
  'city',
  'province',
  'gym',
  'category',
  'estimatedWeight',
  'fullName',
  'birthDate',
  'sex',
  'country',
  'email',
  'streetAddress',
  'postalCode',
  'emergencyContactName',
  'emergencyContactPhone',
])

export const LIFTERS_FIELD_GROUPS = Object.freeze({
  fullName: 'official',
  birthDate: 'official',
  sex: 'sports',
  country: 'official',
  email: 'contact',
  phone: 'contact',
  city: 'contact',
  province: 'contact',
  streetAddress: 'contact',
  postalCode: 'contact',
  gym: 'sports',
  category: 'competition',
  division: 'competition',
  estimatedWeight: 'competition',
  emergencyContactName: 'emergency',
  emergencyContactPhone: 'emergency',
})

/**
 * Planilla de importación de lifters (LiftingCast).
 * Nombres y orden fijos: el importador rechaza el archivo si falta una columna,
 * aunque esa celda vaya vacía. No agregar ni quitar columnas según el dato.
 * Auditoría de división va en la hoja Summary, no en este header.
 *
 * Hipótesis: no hay un CSV oficial de LiftingCast en el repo. Hasta compararlo
 * con el archivo de ejemplo del importador, este header no está verificado.
 */
export const LIFTERS_COLUMNS = Object.freeze([
  { key: 'name', header: 'name', field: 'fullName' },
  { key: 'team', header: 'team', field: 'gym' },
  { key: 'lot', header: 'lot', field: null },
  { key: 'platform', header: 'platform', field: null },
  { key: 'session', header: 'session', field: null },
  { key: 'flight', header: 'flight', field: null },
  { key: 'birthDate', header: 'birthDate', field: 'birthDate' },
  { key: 'memberNumber', header: 'memberNumber', field: null },
  { key: 'gender', header: 'gender', field: 'sex' },
  { key: 'rawOrEquipped', header: 'rawOrEquipped', field: 'category' },
  { key: 'division', header: 'division', field: 'division' },
  { key: 'declaredAwardsWeightClass', header: 'declaredAwardsWeightClass', field: null },
  { key: 'bodyWeight', header: 'bodyWeight', field: 'estimatedWeight' },
  { key: 'squatOpener', header: 'squatOpener', field: null },
  { key: 'benchOpener', header: 'benchOpener', field: null },
  { key: 'deadliftOpener', header: 'deadliftOpener', field: null },
  { key: 'squatRackHeight', header: 'squatRackHeight', field: null },
  { key: 'benchRackHeight', header: 'benchRackHeight', field: null },
  { key: 'deadliftRackHeight', header: 'deadliftRackHeight', field: null },
  { key: 'country', header: 'country', field: 'country' },
  { key: 'state', header: 'state', field: 'province' },
  { key: 'instagram', header: 'instagram', field: null },
  { key: 'notes', header: 'notes', field: null },
])

const COLUMN_WIDTHS = Object.freeze({
  name: 160,
  team: 120,
  lot: 50,
  platform: 90,
  session: 80,
  flight: 60,
  birthDate: 90,
  memberNumber: 110,
  gender: 70,
  rawOrEquipped: 120,
  division: 90,
  declaredAwardsWeightClass: 90,
  bodyWeight: 80,
  squatOpener: 80,
  benchOpener: 80,
  deadliftOpener: 90,
  squatRackHeight: 80,
  benchRackHeight: 80,
  deadliftRackHeight: 90,
  country: 60,
  state: 100,
  instagram: 110,
  notes: 120,
})

const COLUMN_WIDTHS_LIST = Object.freeze(
  LIFTERS_COLUMNS.map((col) => COLUMN_WIDTHS[col.key] ?? 100),
)

/** field requerido → key de columna (para emptyCells en O(1)). */
const FIELD_TO_COLUMN_KEY = Object.freeze(
  Object.fromEntries(
    LIFTERS_COLUMNS.filter((col) => col.field).map((col) => [col.field, col.key]),
  ),
)

const COLUMN_KEY_TO_HEADER = Object.freeze(
  Object.fromEntries(LIFTERS_COLUMNS.map((col) => [col.key, col.header])),
)

function mismatchLabel(divisionFields) {
  if (divisionFields.divisionMismatch) return 'Yes'
  if (divisionFields.divisionOpenUpgrade) return 'Open'
  return ''
}

function fieldValue(athlete, field) {
  if (!athlete) return undefined
  if (field === 'estimatedWeight') {
    return athlete.estimatedWeight ?? athlete.estimated_weight
  }
  if (field === 'streetAddress') {
    return athlete.streetAddress ?? athlete.street_address
  }
  if (field === 'postalCode') {
    return athlete.postalCode ?? athlete.postal_code
  }
  if (field === 'birthDate') {
    return athlete.birthDate ?? athlete.birth_date
  }
  if (field === 'emergencyContactName') {
    return athlete.emergencyContactName ?? athlete.emergency_contact_name
  }
  if (field === 'emergencyContactPhone') {
    return athlete.emergencyContactPhone ?? athlete.emergency_contact_phone
  }
  if (field === 'fullName') {
    return athlete.fullName ?? athlete.full_name
  }
  return athlete[field]
}

export function isMissingLiftersField(athlete, field) {
  const value = fieldValue(athlete, field)
  if (field === 'estimatedWeight') {
    const weight = Number(String(value ?? '').replace(',', '.').replace(/\s*kg$/i, ''))
    return !Number.isFinite(weight) || weight < 10 || weight > 250
  }
  if (field === 'birthDate') {
    return !normalizeExportDate(value)
  }
  if (field === 'email') {
    const email = String(value ?? '').trim()
    return !email || !email.includes('@')
  }
  return !value || String(value).trim().length === 0
}

export function getMissingLiftersFields(athlete, required = REQUIRED_FOR_LIFTERS_EXPORT) {
  return required.filter((field) => isMissingLiftersField(athlete, field))
}

export function isLiftersExportComplete(athlete) {
  return getMissingLiftersFields(athlete).length === 0
}

export function getMissingProfileNoticeFields(athlete) {
  return getMissingLiftersFields(athlete, REQUIRED_FOR_PROFILE_NOTICE)
}

export function isProfileNoticeComplete(athlete) {
  return getMissingProfileNoticeFields(athlete).length === 0
}

/** Proyecta fila snake/camel a lo que usan las reglas de completitud. */
export function athleteFromCompletenessRow(row) {
  if (!row) return null
  return {
    id: row.id,
    fullName: row.full_name ?? row.fullName,
    birthDate: row.birth_date ?? row.birthDate,
    sex: row.sex,
    gym: row.gym,
    country: row.country,
    province: row.province,
    city: row.city,
    streetAddress: row.street_address ?? row.streetAddress,
    postalCode: row.postal_code ?? row.postalCode,
    email: row.email,
    phone: row.phone,
    category: row.category,
    division: row.division,
    estimatedWeight: row.estimated_weight ?? row.estimatedWeight,
    emergencyContactName: row.emergency_contact_name ?? row.emergencyContactName,
    emergencyContactPhone: row.emergency_contact_phone ?? row.emergencyContactPhone,
  }
}

export function mapSexToLiftersGender(sex) {
  return normalizeGender(sex)
}

export function mapCountryToLiftersCode(country) {
  const value = String(country ?? '').trim()
  if (!value) return ''
  const lower = value.toLowerCase()
  if (lower === 'argentina' || lower === 'ar' || lower === 'arg') return 'AR'
  if (value.length === 2) return value.toUpperCase()
  return value
}

/**
 * Filas LiftingCast (solo columnas aprobadas).
 * `incomplete` marca filas con faltantes para estilo en el Excel.
 */
export function buildLiftersExportRows(registrations, athletes, memberships) {
  const athletesById = new Map((athletes ?? []).map((item) => [item.id, item]))
  const membershipsByAthlete = new Map((memberships ?? []).map((item) => [item.athleteId, item]))
  const exportDay = todayCalendarDate()

  const rows = (registrations ?? []).map((registration) => {
    const athlete = athletesById.get(registration.athleteId) ?? null
    const membership = membershipsByAthlete.get(registration.athleteId)
    const category = registration.category || athlete?.category || ''
    const referenceDate = referenceDateForExport(registration, exportDay)
    const declaredDivision = registration.division || athlete?.division || ''
    const divisionFields = resolveDivisionExportFields(
      athlete?.birthDate,
      referenceDate,
      declaredDivision,
    )
    const division = divisionFields.division
    const missing = getMissingLiftersFields({
      ...athlete,
      category,
      division,
    })
    const emptyColumns = []
    for (const field of missing) {
      const key = FIELD_TO_COLUMN_KEY[field]
      if (key) emptyColumns.push(key)
    }

    const declaredBodyweight = formatDeclaredBodyWeight(
      registration.bodyweight ?? registration.bodyweightKg ?? fieldValue(athlete, 'estimatedWeight'),
    )
    const weighInBodyweight = formatDeclaredBodyWeight(
      registration.weighInBodyweight ?? registration.weigh_in_bodyweight_kg,
    )
    const bodyWeight = weighInBodyweight || declaredBodyweight
    const declaredClass = String(
      registration.declaredWeightClass ?? registration.declared_weight_class ?? '',
    ).trim()
    const officialClass = String(
      registration.officialWeightClass ?? registration.official_weight_class ?? '',
    ).trim()
    const declaredAwardsWeightClass = officialClass || declaredClass
    if (!bodyWeight) emptyColumns.push('bodyWeight')
    if (!declaredAwardsWeightClass) emptyColumns.push('declaredAwardsWeightClass')

    return {
      name: athlete?.fullName ?? '',
      team: athlete?.gym ?? '',
      lot: '',
      platform: registration.platform ?? '',
      session: registration.meetDay ?? '',
      flight: registration.flight ?? '',
      birthDate: formatExportDateDmy(athlete?.birthDate),
      memberNumber: membership?.memberCode ?? '',
      gender: mapSexToLiftersGender(athlete?.sex),
      rawOrEquipped: category,
      division,
      declaredAwardsWeightClass,
      bodyWeight,
      squatOpener: '',
      benchOpener: '',
      deadliftOpener: '',
      squatRackHeight: '',
      benchRackHeight: '',
      deadliftRackHeight: '',
      country: mapCountryToLiftersCode(athlete?.country),
      state: athlete?.province ?? '',
      instagram: athlete?.instagramHandle ?? athlete?.instagram_handle ?? '',
      notes: '',
      phoneNumber: athlete?.phone ?? '',
      email: athlete?.email ?? '',
      divisionEntered: divisionFields.divisionDeclared,
      divisionMismatch: mismatchLabel(divisionFields),
      _meta: {
        athleteId: registration.athleteId,
        registrationId: registration.id,
        missing,
        emptyColumns,
        incomplete: missing.length > 0,
        divisionMismatch: divisionFields.divisionMismatch,
        divisionOpenUpgrade: divisionFields.divisionOpenUpgrade,
        divisionDeclared: divisionFields.divisionDeclared,
        divisionCalculated: divisionFields.divisionCalculated,
        age: divisionFields.age,
        eventTitle: liftersEventTitle(registration),
        declaredBodyweight,
        weighInBodyweight,
        bodyweightSource: weighInBodyweight ? 'weigh-in' : 'declared',
        declaredWeightClass: declaredClass,
        officialWeightClass: officialClass,
        rosterFrozen: Boolean(registration.rosterFrozenAt ?? registration.roster_frozen_at),
      },
    }
  })
  return assignLifterLots(rows)
}

/** Lote 1..n dentro de cada tanda, por nombre. Sin tanda, el lote queda vacío. */
export function assignLifterLots(rows) {
  const groups = new Map()
  for (const row of rows ?? []) {
    if (!row?.flight) continue
    const key = [row.session, row.flight, row.platform].join('|')
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }
  for (const list of groups.values()) {
    list.sort((a, b) =>
      String(a.name ?? '').localeCompare(String(b.name ?? ''), 'es', { sensitivity: 'base' }),
    )
    list.forEach((row, index) => {
      row.lot = String(index + 1)
    })
  }
  return rows
}

/** Keys válidas en orden canónico. */
export const LIFTERS_COLUMN_KEYS = Object.freeze(LIFTERS_COLUMNS.map((col) => col.key))

/** Presets de columnas para el studio. El Excel usa este recorte. */
export const LIFTERS_EXPORT_PRESETS = Object.freeze({
  audit: Object.freeze([...LIFTERS_COLUMN_KEYS]),
  official: Object.freeze([...LIFTERS_COLUMN_KEYS]),
  minimal: Object.freeze([
    'name',
    'birthDate',
    'memberNumber',
    'gender',
    'rawOrEquipped',
    'division',
    'declaredAwardsWeightClass',
    'bodyWeight',
    'country',
  ]),
  contact: Object.freeze(['name', 'team', 'country', 'state', 'instagram']),
})

export const DEFAULT_LIFTERS_EXPORT_OPTIONS = Object.freeze({
  preset: 'audit',
  columns: null,
  rowFilter: 'all',
  highlightEmpty: true,
  freezeHeader: true,
  includeSummarySheet: true,
  theme: 'lifters',
})

const FIELD_LABELS = Object.freeze(
  Object.fromEntries(
    LIFTERS_COLUMNS.filter((col) => col.field).map((col) => [col.field, col.header]),
  ),
)

const COLUMN_KEY_SET = new Set(LIFTERS_COLUMN_KEYS)

function coerceBoolean(value, fallback) {
  if (value === true || value === '1' || value === 1 || value === 'true') return true
  if (value === false || value === '0' || value === 0 || value === 'false') return false
  return fallback
}

/** Normaliza opciones del studio (query, localStorage o UI). */
export function normalizeLiftersExportOptions(raw = {}) {
  const input = raw && typeof raw === 'object' ? raw : {}
  const presetRaw = String(input.preset ?? DEFAULT_LIFTERS_EXPORT_OPTIONS.preset).trim()
  const preset = LIFTERS_EXPORT_PRESETS[presetRaw] ? presetRaw : 'audit'

  let columns = null
  if (Array.isArray(input.columns)) {
    columns = input.columns.map(String).filter((key) => COLUMN_KEY_SET.has(key))
  } else if (typeof input.columns === 'string' && input.columns.trim()) {
    columns = input.columns
      .split(',')
      .map((part) => part.trim())
      .filter((key) => COLUMN_KEY_SET.has(key))
  }
  if (columns && !columns.length) columns = null

  const rowFilterRaw = String(input.rowFilter ?? 'all').trim()
  const rowFilter =
    rowFilterRaw === 'complete' || rowFilterRaw === 'incomplete' ? rowFilterRaw : 'all'

  return {
    preset,
    columns,
    rowFilter,
    highlightEmpty: coerceBoolean(input.highlightEmpty, true),
    freezeHeader: coerceBoolean(input.freezeHeader, true),
    includeSummarySheet: coerceBoolean(input.includeSummarySheet, true),
    theme: input.theme === 'default' ? 'default' : 'lifters',
  }
}

/**
 * Segunda hoja del Excel: totales, ranking de campos vacíos y atletas incompletos.
 * Encabezados en inglés para alinear con LiftingCast; contenido operativo.
 */
export function buildLiftersSummarySheet(rows) {
  const readiness = buildLiftersReadiness(rows)
  const summaryRows = [
    {
      Type: 'Summary',
      Item: 'Registered',
      Count: String(readiness.total),
      Percent: '100',
      Notes: '',
    },
    {
      Type: 'Summary',
      Item: 'Complete',
      Count: String(readiness.complete),
      Percent: String(
        readiness.total ? Math.round((readiness.complete / readiness.total) * 100) : 0,
      ),
      Notes: '',
    },
    {
      Type: 'Summary',
      Item: 'Incomplete',
      Count: String(readiness.incomplete),
      Percent: String(
        readiness.total ? Math.round((readiness.incomplete / readiness.total) * 100) : 0,
      ),
      Notes: '',
    },
    {
      Type: 'Summary',
      Item: 'Division mismatch',
      Count: String(readiness.divisionMismatch),
      Percent: String(
        readiness.total ? Math.round((readiness.divisionMismatch / readiness.total) * 100) : 0,
      ),
      Notes: 'Hard mismatch (invalid for age)',
    },
    {
      Type: 'Summary',
      Item: 'Open upgrade',
      Count: String(readiness.divisionOpenUpgrade),
      Percent: String(
        readiness.total
          ? Math.round((readiness.divisionOpenUpgrade / readiness.total) * 100)
          : 0,
      ),
      Notes: 'Allowed: age band entered Open',
    },
  ]

  const gapIncompleteIndexes = []
  for (const gap of readiness.fieldGaps) {
    gapIncompleteIndexes.push(summaryRows.length)
    summaryRows.push({
      Type: 'Empty field',
      Item: FIELD_LABELS[gap.field] || gap.field,
      Count: String(gap.count),
      Percent: String(gap.percent),
      Notes: gap.field,
    })
  }

  const athleteIncompleteIndexes = []
  for (const athlete of readiness.athletes.slice(0, 200)) {
    athleteIncompleteIndexes.push(summaryRows.length)
    const missingLabels = (athlete.missing ?? [])
      .map((field) => FIELD_LABELS[field] || field)
      .join(', ')
    summaryRows.push({
      Type: 'Incomplete athlete',
      Item: athlete.name || athlete.athleteId || '',
      Count: String(athlete.missing?.length ?? 0),
      Percent: '',
      Notes: missingLabels,
    })
  }

  const mismatchIndexes = []
  for (const athlete of readiness.divisionMismatchAthletes.slice(0, 100)) {
    mismatchIndexes.push(summaryRows.length)
    summaryRows.push({
      Type: 'Division mismatch',
      Item: athlete.name || athlete.athleteId || '',
      Count: '1',
      Percent: '',
      Notes: `${athlete.divisionDeclared || '—'} → ${athlete.divisionCalculated || '—'}`,
    })
  }

  return {
    sheetName: 'Summary',
    rows: summaryRows,
    incompleteRowIndexes: [...gapIncompleteIndexes, ...athleteIncompleteIndexes],
    mismatchRowIndexes: mismatchIndexes,
    columnWidths: [120, 180, 70, 70, 280],
    freezeHeader: true,
  }
}

/** La plantilla de importación tiene que salir completa. Los otros presets no. */
export function liftersImportColumnsMissing(options = {}) {
  const opts = normalizeLiftersExportOptions(options)
  if (opts.preset !== 'official' && opts.preset !== 'audit') return false
  const keys = new Set(resolveLiftersColumnKeys(opts))
  return LIFTERS_COLUMN_KEYS.some((key) => !keys.has(key))
}

export function summarizeLifterMeet(rows) {
  const groups = new Map()
  const mismatches = []
  const missingWeighIn = []
  for (const row of rows ?? []) {
    const weightClass = String(row?.declaredAwardsWeightClass ?? '').trim() || '—'
    const key = [row?.gender || '—', row?.division || '—', row?.rawOrEquipped || '—', weightClass].join('|')
    const current = groups.get(key) ?? {
      gender: row?.gender || '—',
      division: row?.division || '—',
      equipment: row?.rawOrEquipped || '—',
      weightClass,
      count: 0,
    }
    current.count += 1
    groups.set(key, current)
    const declared = String(row?._meta?.declaredWeightClass ?? '').trim()
    const official = String(row?._meta?.officialWeightClass ?? '').trim()
    if (official && declared && official !== declared) {
      mismatches.push({
        athleteId: row?._meta?.athleteId ?? null,
        athleteName: row?.name ?? '',
        declared,
        official,
      })
    }
    if (row?._meta?.rosterFrozen && !row?._meta?.weighInBodyweight) {
      missingWeighIn.push({
        athleteId: row?._meta?.athleteId ?? null,
        athleteName: row?.name ?? '',
      })
    }
  }
  const classGroups = [...groups.values()]
  return {
    classGroups,
    smallClasses: classGroups.filter((group) => group.count > 0 && group.count <= 2),
    mismatches,
    missingWeighIn,
  }
}

export function resolveLiftersColumnKeys(options = {}) {
  const opts = normalizeLiftersExportOptions(options)
  if (opts.columns?.length) {
    const selected = new Set(opts.columns)
    return LIFTERS_COLUMN_KEYS.filter((key) => selected.has(key))
  }
  return [...(LIFTERS_EXPORT_PRESETS[opts.preset] ?? LIFTERS_EXPORT_PRESETS.audit)]
}

export function filterLiftersRowsByCompleteness(rows, rowFilter = 'all') {
  const list = rows ?? []
  if (rowFilter === 'complete') return list.filter((row) => !row._meta?.incomplete)
  if (rowFilter === 'incomplete') return list.filter((row) => row._meta?.incomplete)
  return list
}

function columnsForKeys(columnKeys) {
  const selected = new Set(columnKeys ?? LIFTERS_COLUMN_KEYS)
  return LIFTERS_COLUMNS.filter((col) => selected.has(col.key))
}

/** Filas listas para Excel con encabezados LiftingCast (sin `_meta`). */
export function liftersRowsForSpreadsheet(rows, columnKeys = null) {
  const cols = columnsForKeys(columnKeys)
  return (rows ?? []).map((row) => {
    const out = {}
    for (const col of cols) {
      out[col.header] = row[col.key] ?? ''
    }
    return out
  })
}

/** Preview liviano: filas × columnas según opciones del studio. */
export function previewLiftersExport(rows, options = {}) {
  const opts = normalizeLiftersExportOptions(options)
  const filtered = filterLiftersRowsByCompleteness(rows, opts.rowFilter)
  const columns = resolveLiftersColumnKeys(opts)
  return {
    rowCount: filtered.length,
    columnCount: columns.length,
    columns,
    rowFilter: opts.rowFilter,
    preset: opts.preset,
  }
}

export function buildLiftersFieldGaps(rows) {
  const list = rows ?? []
  const total = list.length || 1
  const counts = new Map()
  for (const field of REQUIRED_FOR_LIFTERS_EXPORT) counts.set(field, 0)
  for (const row of list) {
    for (const field of row._meta?.missing ?? []) {
      counts.set(field, (counts.get(field) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([field, count]) => ({
      field,
      count,
      percent: Math.round((count / total) * 100),
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.field.localeCompare(b.field))
}

export function buildLiftersReadiness(rows) {
  const list = rows ?? []
  const total = list.length
  const gapCounts = new Map()
  for (const field of REQUIRED_FOR_LIFTERS_EXPORT) gapCounts.set(field, 0)

  let incompleteCount = 0
  let mismatchCount = 0
  let openUpgradeCount = 0
  const incompleteAthletes = []
  const mismatchAthletes = []
  const eventTitles = new Set()

  for (const row of list) {
    const meta = row._meta
    if (!meta) continue
    if (meta.eventTitle) eventTitles.add(meta.eventTitle)
    if (meta.incomplete) {
      incompleteCount += 1
      incompleteAthletes.push({
        athleteId: meta.athleteId,
        registrationId: meta.registrationId,
        name: row.name,
        phone: row.phoneNumber || '',
        email: row.email || '',
        missing: meta.missing,
      })
      for (const field of meta.missing ?? []) {
        gapCounts.set(field, (gapCounts.get(field) ?? 0) + 1)
      }
    }
    if (meta.divisionMismatch) {
      mismatchCount += 1
      mismatchAthletes.push({
        athleteId: meta.athleteId,
        registrationId: meta.registrationId,
        name: row.name,
        divisionDeclared: meta.divisionDeclared,
        divisionCalculated: meta.divisionCalculated,
      })
    } else if (meta.divisionOpenUpgrade) {
      openUpgradeCount += 1
    }
  }

  const fieldGaps = [...gapCounts.entries()]
    .map(([field, count]) => ({
      field,
      count,
      percent: Math.round((count / (total || 1)) * 100),
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.field.localeCompare(b.field))

  return {
    total,
    complete: total - incompleteCount,
    incomplete: incompleteCount,
    divisionMismatch: mismatchCount,
    divisionOpenUpgrade: openUpgradeCount,
    fieldGaps,
    topGaps: fieldGaps.slice(0, 5),
    athletes: incompleteAthletes,
    divisionMismatchAthletes: mismatchAthletes,
    events: [...eventTitles].sort((left, right) => left.localeCompare(right, 'es')),
  }
}

const OPENER_KEYS = Object.freeze([
  ['squatOpener', 'squatOpener'],
  ['benchOpener', 'benchOpener'],
  ['deadliftOpener', 'deadliftOpener'],
])

function openerIssue(row, key) {
  const value = String(row[key] ?? '').trim()
  if (!value) return null
  if (!/^\d+(\.\d+)?$/.test(value)) {
    return { field: key, message: 'El opener no es un número válido.' }
  }
  return null
}

/** Errores de una fila ya armada para la planilla. No incluye la advertencia de peso. */
export function lifterExportRowErrors(row) {
  const issues = []
  const athleteId = row?._meta?.athleteId ?? null
  const athleteName = row?.name ?? ''
  const push = (field, message) => issues.push({ athleteId, athleteName, field, message })

  if (!row?.gender) push('gender', 'Sexo desconocido para el importador.')
  if (!normalizeEquipment(row?.rawOrEquipped)) push('rawOrEquipped', 'Equipamiento desconocido.')
  if (!normalizeDivision(row?.division)) push('division', 'División desconocida.')
  if (!row?.birthDate || !/^\d{2}\/\d{2}\/\d{4}$/.test(String(row.birthDate))) {
    push('birthDate', 'Fecha inválida.')
  }
  if (!row?.bodyWeight || !/^\d+(\.\d+)?$/.test(String(row.bodyWeight))) {
    push('bodyWeight', 'Peso corporal inválido.')
  }
  const weightClass = String(row?.declaredAwardsWeightClass ?? '').trim()
  if (!weightClass) {
    push('declaredAwardsWeightClass', 'Falta la categoría de peso.')
  } else if (!isDeclaredWeightClassForSex(row?.gender, weightClass)) {
    push('declaredAwardsWeightClass', 'La categoría no corresponde al sexo.')
  }
  for (const [key] of OPENER_KEYS) {
    const issue = openerIssue(row, key)
    if (issue) push(issue.field, issue.message)
  }
  return issues
}

/** READY, WARNING o ERROR. WARNING no bloquea la descarga. */
export function classifyLifterExportRow(row) {
  if (lifterExportRowErrors(row).length) return 'ERROR'
  if (
    getWeightClassWarning(row?.bodyWeight, row?.declaredAwardsWeightClass, {
      source: row?._meta?.bodyweightSource,
    })
  ) {
    return 'WARNING'
  }
  return 'READY'
}

/**
 * Validación previa a generar el archivo. No toca React.
 * `valid` es false solo cuando hay errores críticos.
 */
export function validateLifterExport(rows) {
  const errors = []
  const warnings = []
  let ready = 0
  let warningCount = 0
  let errorCount = 0
  for (const row of rows ?? []) {
    const rowErrors = lifterExportRowErrors(row)
    const warning = getWeightClassWarning(row?.bodyWeight, row?.declaredAwardsWeightClass, {
      source: row?._meta?.bodyweightSource,
    })
    if (rowErrors.length) {
      errorCount += 1
      errors.push(...rowErrors)
      continue
    }
    if (warning) {
      warningCount += 1
      warnings.push({
        athleteId: row?._meta?.athleteId ?? null,
        athleteName: row?.name ?? '',
        field: 'declaredAwardsWeightClass',
        message: warning.message,
      })
      continue
    }
    ready += 1
  }
  return {
    valid: errorCount === 0,
    total: (rows ?? []).length,
    ready,
    warnings: warningCount,
    errors: errorCount,
    issues: errors,
    warningIssues: warnings,
  }
}

function liftersEventTitle(registration) {
  const value = registration?.event
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object') return String(value.title ?? '').trim()
  return ''
}

/** Spreadsheet Lifters: headers LiftingCast, freeze, celdas vacías / mismatch. */
export function serializeLiftersSpreadsheet(rows, sheetName = 'Lifters', options = {}) {
  const opts = normalizeLiftersExportOptions(options)
  const list = filterLiftersRowsByCompleteness(rows, opts.rowFilter)
  if (!list.length) return null

  const columnKeys = resolveLiftersColumnKeys(opts)
  const selectedKeys = new Set(columnKeys)
  const sheetRows = liftersRowsForSpreadsheet(list, columnKeys)
  const incompleteRowIndexes = []
  const mismatchRowIndexes = []
  const emptyCells = []

  for (let rowIndex = 0; rowIndex < list.length; rowIndex += 1) {
    const meta = list[rowIndex]._meta
    if (!meta) continue
    if (meta.incomplete) {
      incompleteRowIndexes.push(rowIndex)
    } else if (meta.divisionMismatch) {
      mismatchRowIndexes.push(rowIndex)
    }
    if (opts.highlightEmpty) {
      for (const key of meta.emptyColumns ?? []) {
        if (!selectedKeys.has(key)) continue
        const header = COLUMN_KEY_TO_HEADER[key]
        if (header) emptyCells.push({ row: rowIndex, column: header })
      }
    }
  }

  const columnWidths = columnKeys.map((key) => COLUMN_WIDTHS[key] ?? 100)
  const extraSheets = []
  if (opts.includeSummarySheet) {
    // Resumen sobre el mismo recorte de filas que sale en Lifters.
    const summary = buildLiftersSummarySheet(list)
    if (summary.rows.length) extraSheets.push(summary)
  }

  return serializeSpreadsheet(sheetRows, sheetName, {
    incompleteRowIndexes,
    mismatchRowIndexes,
    emptyCells: opts.highlightEmpty ? emptyCells : [],
    columnWidths: columnWidths.length ? columnWidths : COLUMN_WIDTHS_LIST,
    freezeHeader: opts.freezeHeader,
    theme: opts.theme,
    extraSheets,
  })
}
