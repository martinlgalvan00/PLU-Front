/**
 * División de competencia por edad (PLU §1.3 → lexikon del sistema).
 * Puro: sin I/O. Edad y fechas de calendario sin Date/TZ en el cálculo.
 */

export const COMPETITION_DIVISIONS = Object.freeze([
  'Open',
  'Youth',
  'Junior',
  'Sub-Masters',
  'Masters',
])

/** Franjas inclusivas: [minAge, maxAge] → division. Orden: más específicas primero. */
export const AGE_DIVISION_BANDS = Object.freeze([
  { min: 10, max: 12, division: 'Youth' },
  { min: 13, max: 23, division: 'Junior' },
  { min: 24, max: 34, division: 'Open' },
  { min: 35, max: 39, division: 'Sub-Masters' },
  { min: 40, max: 130, division: 'Masters' },
])

/**
 * Alias legacy / variantes → lexikon canónico.
 * Incluye remapeos de la migración PLU v26.1 (Sub-Junior, Master I/II).
 */
export const DIVISION_ALIASES = Object.freeze({
  open: 'Open',
  youth: 'Youth',
  junior: 'Junior',
  'sub-junior': 'Youth',
  subjunior: 'Youth',
  'sub junior': 'Youth',
  'sub-masters': 'Sub-Masters',
  submasters: 'Sub-Masters',
  'sub masters': 'Sub-Masters',
  submaster: 'Sub-Masters',
  masters: 'Masters',
  master: 'Masters',
  'master i': 'Masters',
  'master ii': 'Masters',
  'master 1': 'Masters',
  'master 2': 'Masters',
  'masters i': 'Masters',
  'masters ii': 'Masters',
})

const DAYS_IN_MONTH = Object.freeze([0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return DAYS_IN_MONTH[month] ?? 0
}

function isValidCalendarDay(year, month, day) {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1900 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1
  ) {
    return false
  }
  return day <= daysInMonth(year, month)
}

/**
 * Normaliza cualquier input de fecha a YYYY-MM-DD de calendario real.
 * Acepta: ISO, YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY (día/mes ambiguos → día primero).
 */
export function toCalendarDate(value) {
  if (value == null || value === '') return ''
  const raw = String(value).trim()
  if (!raw) return ''

  let year
  let month
  let day

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    year = Number(iso[1])
    month = Number(iso[2])
    day = Number(iso[3])
  } else {
    const dmy = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\b|$)/)
    if (!dmy) return ''
    day = Number(dmy[1])
    month = Number(dmy[2])
    year = Number(dmy[3])
  }

  if (!isValidCalendarDay(year, month, day)) return ''
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseCalendarParts(isoDate) {
  const calendar = toCalendarDate(isoDate)
  if (!calendar) return null
  const [year, month, day] = calendar.split('-').map(Number)
  return { year, month, day }
}

/** Fecha calendario local YYYY-MM-DD (día del export). */
export function todayCalendarDate(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Edad cumplida en `referenceDate` (ambas fechas YYYY-MM-DD o formatos aceptados).
 * @returns {number|null}
 */
export function ageOnDate(birthDate, referenceDate) {
  const birth = parseCalendarParts(birthDate)
  const ref = parseCalendarParts(referenceDate)
  if (!birth || !ref) return null

  let age = ref.year - birth.year
  if (ref.month < birth.month || (ref.month === birth.month && ref.day < birth.day)) {
    age -= 1
  }
  if (age < 0 || age > 130) return null
  return age
}

/**
 * Canoniza división declarada (aliases, espacios, case).
 * @returns {string} lexikon o '' si no reconocible
 */
export function normalizeCompetitionDivision(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (COMPETITION_DIVISIONS.includes(raw)) return raw

  const key = raw
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/\p{M}/gu, '')
    .replaceAll(/[_/]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()

  if (DIVISION_ALIASES[key]) return DIVISION_ALIASES[key]

  const compact = key.replaceAll(/[\s-]+/g, '')
  for (const [alias, division] of Object.entries(DIVISION_ALIASES)) {
    if (alias.replaceAll(/[\s-]+/g, '') === compact) return division
  }
  return ''
}

/**
 * División del sistema según edad al día de referencia.
 * Sin DOB / edad &lt; 10 / inválida → string vacío.
 */
export function resolveCompetitionDivision(birthDate, referenceDate = todayCalendarDate()) {
  const age = ageOnDate(birthDate, referenceDate || todayCalendarDate())
  if (age == null || age < 10) return ''

  for (const band of AGE_DIVISION_BANDS) {
    if (age >= band.min && age <= band.max) return band.division
  }
  return ''
}

/**
 * Preferir división calculada; si no hay DOB usable, fallback declarado (canonizado).
 */
export function resolveExportDivision(birthDate, referenceDate, declaredDivision = '') {
  return resolveDivisionExportFields(birthDate, referenceDate, declaredDivision).division
}

/**
 * Diagnóstico completo de división para export / auditoría.
 *
 * - `division`: franja calculada si hay DOB; si no, declarada canonizada.
 * - `divisionMismatch`: desajuste duro (inscrita no permitida para la edad).
 * - `divisionOpenUpgrade`: inscrita Open siendo de otra franja (válido PLU §1.3).
 *
 * Open upgrade NO cuenta como mismatch: Junior/Youth/Masters pueden elegir Open.
 */
export function resolveDivisionExportFields(birthDate, referenceDate, declaredDivision = '') {
  const declaredRaw = String(declaredDivision ?? '').trim()
  const declared = normalizeCompetitionDivision(declaredRaw) || declaredRaw
  const ref = toCalendarDate(referenceDate) || todayCalendarDate()
  const age = ageOnDate(birthDate, ref)
  const calculated = resolveCompetitionDivision(birthDate, ref)
  const division = calculated || declared
  const allowed = calculated
    ? calculated === 'Open'
      ? ['Open']
      : [calculated, 'Open']
    : []

  const declaredCanonical = normalizeCompetitionDivision(declaredRaw)
  const hasDeclared = Boolean(declaredCanonical)
  const openUpgrade = Boolean(
    calculated && calculated !== 'Open' && declaredCanonical === 'Open',
  )
  const hardMismatch = Boolean(
    calculated && hasDeclared && !allowed.includes(declaredCanonical),
  )
  const differs = Boolean(
    calculated && hasDeclared && declaredCanonical !== calculated,
  )

  return {
    division,
    divisionDeclared: declaredCanonical || declaredRaw,
    divisionCalculated: calculated,
    divisionMismatch: hardMismatch,
    divisionOpenUpgrade: openUpgrade,
    divisionDiffers: differs,
    age,
    referenceDate: ref,
  }
}

/**
 * Divisiones permitidas al inscribirse (PLU §1.3):
 * franja de edad + Open (siempre desde los 10).
 * Sin DOB usable / menor de 10 → [].
 */
export function allowedCompetitionDivisions(birthDate, referenceDate = todayCalendarDate()) {
  const age = ageOnDate(birthDate, referenceDate || todayCalendarDate())
  if (age == null || age < 10) return []

  const primary = resolveCompetitionDivision(birthDate, referenceDate)
  const allowed = []
  if (primary) allowed.push(primary)
  if (primary && primary !== 'Open') allowed.push('Open')
  return allowed
}

export function isDivisionAllowedForAge(division, birthDate, referenceDate = todayCalendarDate()) {
  const value = normalizeCompetitionDivision(division) || String(division ?? '').trim()
  if (!value) return false
  return allowedCompetitionDivisions(birthDate, referenceDate).includes(value)
}

/**
 * Preferencia al prellenar: franja natural si la declarada no aplica.
 */
export function resolveRegistrationDivision(birthDate, referenceDate, declaredDivision = '') {
  const declared =
    normalizeCompetitionDivision(declaredDivision) || String(declaredDivision ?? '').trim()
  if (declared && isDivisionAllowedForAge(declared, birthDate, referenceDate)) {
    return declared
  }
  return resolveCompetitionDivision(birthDate, referenceDate)
}

/**
 * Fecha de referencia para export: starts_at del evento → eventDate → fallback.
 */
export function referenceDateForExport(registration, fallbackDate = todayCalendarDate()) {
  return (
    toCalendarDate(registration?.eventStartsAt) ||
    toCalendarDate(registration?.eventDate) ||
    toCalendarDate(fallbackDate) ||
    todayCalendarDate()
  )
}
