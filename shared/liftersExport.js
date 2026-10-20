/**
 * Export Lifters (estilo LiftingCast) + completitud para avisos de perfil.
 */

import {
  referenceDateForExport,
  resolveDivisionExportFields,
  todayCalendarDate,
} from './ageDivision.js'
import { normalizeExportDate, serializeSpreadsheet } from './exportRows.js'

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
  'division',
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

/** Orden y encabezados visibles (formato LiftingCast / Excel de referencia). */
export const LIFTERS_COLUMNS = Object.freeze([
  { key: 'name', header: 'Name', field: 'fullName' },
  { key: 'team', header: 'Team', field: 'gym' },
  { key: 'birthDate', header: 'Birth Date', field: 'birthDate' },
  { key: 'memberNumber', header: 'Member Number', field: null },
  { key: 'gender', header: 'Gender', field: 'sex' },
  { key: 'rawOrEquipped', header: 'RawOrEquipped', field: 'category' },
  { key: 'division', header: 'Division', field: 'division' },
  { key: 'country', header: 'Country', field: 'country' },
  { key: 'streetAddress', header: 'StreetAddress', field: 'streetAddress' },
  { key: 'city', header: 'City', field: 'city' },
  { key: 'state', header: 'State', field: 'province' },
  { key: 'zipCode', header: 'Zip Code', field: 'postalCode' },
  { key: 'email', header: 'Email', field: 'email' },
  { key: 'phoneNumber', header: 'Phone', field: 'phone' },
  { key: 'emergencyContactName', header: 'EmergencyContactName', field: 'emergencyContactName' },
  {
    key: 'emergencyContactPhoneNumber',
    header: 'EmergencyContactPhone',
    field: 'emergencyContactPhone',
  },
  // Auditoría PLU (al final para no correr columnas LiftingCast por índice).
  { key: 'divisionEntered', header: 'DivisionEntered', field: null },
  { key: 'divisionMismatch', header: 'DivisionMismatch', field: null },
])

const COLUMN_WIDTHS = Object.freeze({
  name: 160,
  team: 120,
  birthDate: 90,
  memberNumber: 110,
  gender: 70,
  rawOrEquipped: 110,
  division: 90,
  country: 60,
  streetAddress: 160,
  city: 100,
  state: 100,
  zipCode: 70,
  email: 180,
  phoneNumber: 110,
  emergencyContactName: 140,
  emergencyContactPhoneNumber: 130,
  divisionEntered: 110,
  divisionMismatch: 100,
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
  const value = String(sex ?? '').trim().toLowerCase()
  if (value === 'masculino' || value === 'male' || value === 'm') return 'Male'
  if (value === 'femenino' || value === 'female' || value === 'f') return 'Female'
  return String(sex ?? '').trim()
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

  return (registrations ?? []).map((registration) => {
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

    return {
      name: athlete?.fullName ?? '',
      team: athlete?.gym ?? '',
      birthDate: normalizeExportDate(athlete?.birthDate),
      memberNumber: membership?.memberCode ?? '',
      gender: mapSexToLiftersGender(athlete?.sex),
      rawOrEquipped: category,
      division,
      country: mapCountryToLiftersCode(athlete?.country),
      streetAddress: athlete?.streetAddress ?? '',
      city: athlete?.city ?? '',
      state: athlete?.province ?? '',
      zipCode: athlete?.postalCode ?? '',
      email: athlete?.email ?? '',
      phoneNumber: athlete?.phone ?? '',
      emergencyContactName: athlete?.emergencyContactName ?? '',
      emergencyContactPhoneNumber: athlete?.emergencyContactPhone ?? '',
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
      },
    }
  })
}

/** Keys válidas en orden canónico. */
export const LIFTERS_COLUMN_KEYS = Object.freeze(LIFTERS_COLUMNS.map((col) => col.key))

const AUDIT_COLUMN_KEYS = Object.freeze(['divisionEntered', 'divisionMismatch'])

/** Presets de columnas para el studio de export. */
export const LIFTERS_EXPORT_PRESETS = Object.freeze({
  audit: Object.freeze([...LIFTERS_COLUMN_KEYS]),
  official: Object.freeze(LIFTERS_COLUMN_KEYS.filter((key) => !AUDIT_COLUMN_KEYS.includes(key))),
  minimal: Object.freeze([
    'name',
    'birthDate',
    'memberNumber',
    'gender',
    'rawOrEquipped',
    'division',
    'country',
  ]),
  contact: Object.freeze([
    'name',
    'team',
    'email',
    'phoneNumber',
    'streetAddress',
    'city',
    'state',
    'zipCode',
    'emergencyContactName',
    'emergencyContactPhoneNumber',
  ]),
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

  for (const row of list) {
    const meta = row._meta
    if (!meta) continue
    if (meta.incomplete) {
      incompleteCount += 1
      incompleteAthletes.push({
        athleteId: meta.athleteId,
        registrationId: meta.registrationId,
        name: row.name,
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
  }
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
