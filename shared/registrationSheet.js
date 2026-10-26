/**
 * Planilla de inscripciones (.xlsx) de ida y vuelta.
 *
 * El staff la exporta, corrige algunas columnas en Excel/Sheets y la vuelve a
 * subir: el servidor compara cada fila contra la inscripción guardada y aplica
 * solo lo que cambió. Este módulo es la única definición de las columnas, de
 * cómo se lee cada celda y de qué cambio es válido; lo comparten el navegador
 * (exportar y leer el archivo) y la API (validar y aplicar). Puro, sin I/O.
 *
 * Se editan los datos competitivos que no mueven plata ni cupo: división,
 * categoría, modalidades (sin recargo), categoría de peso y peso corporal. La
 * segunda división cambia el precio (50%) y el estado pasa por Cobros: quedan
 * de solo lectura. Una celda editable vacía significa "no cambiar", nunca
 * "borrar": todos esos datos son obligatorios en una inscripción.
 */

import { COMPETITION_DIVISIONS, normalizeCompetitionDivision } from './ageDivision.js'
import { EQUIPMENT_TYPES, normalizeEquipment } from './competitionLexicon.js'
import { validateSelectionAgainstOffering } from './eventOffering.js'
import {
  canonicalDeclaredWeightClass,
  getWeightClassWarning,
  isDeclaredWeightClassForSex,
  MEN_WEIGHT_CLASSES,
  WOMEN_WEIGHT_CLASSES,
} from './pluWeightClasses.js'
import { BODYWEIGHT_KG_RANGE, isValidBodyweightKg } from './registrationRequirements.js'
import {
  formatModalities,
  normalizeModalities,
  REGISTRATION_MODALITIES,
  validateModalities,
} from './registrationSelection.js'

export const REGISTRATION_SHEET_NAME = 'Inscripciones'
export const REGISTRATION_SHEET_HELP_NAME = 'Cómo editar'
/** Filas que acepta un archivo. */
export const REGISTRATION_IMPORT_MAX_ROWS = 2000
/** Filas por request: el body JSON de la API tiene un tope de 100 KB. */
export const REGISTRATION_IMPORT_BATCH_SIZE = 300

/** Campos que la importación puede cambiar, en el orden en que se muestran. */
export const REGISTRATION_SHEET_EDITABLE_FIELDS = Object.freeze([
  'division',
  'category',
  'modalities',
  'declaredWeightClass',
  'bodyweightKg',
])

/**
 * Columnas de la planilla. `aliases` son otros encabezados que se aceptan al
 * importar (una planilla vieja, un encabezado traducido a mano).
 */
export const REGISTRATION_SHEET_COLUMNS = Object.freeze([
  {
    key: 'registrationId',
    header: 'ID inscripción',
    width: 38,
    aliases: ['id', 'registration id'],
  },
  { key: 'event', header: 'Evento', width: 26 },
  { key: 'athlete', header: 'Atleta', width: 28 },
  { key: 'document', header: 'DNI', width: 13, aliases: ['documento'] },
  { key: 'email', header: 'Email', width: 30 },
  { key: 'sex', header: 'Sexo', width: 11 },
  { key: 'division', header: 'División', width: 14, editable: true },
  { key: 'secondaryDivision', header: 'Segunda división', width: 16 },
  {
    key: 'category',
    header: 'Categoría',
    width: 17,
    editable: true,
    aliases: ['categoria de competencia', 'equipamiento'],
  },
  { key: 'modalities', header: 'Modalidades', width: 24, editable: true, aliases: ['modalidad'] },
  {
    key: 'declaredWeightClass',
    header: 'Categoría de peso',
    width: 17,
    editable: true,
    aliases: ['categoria de peso (kg)', 'clase de peso', 'weight class'],
  },
  {
    key: 'bodyweightKg',
    header: 'Peso corporal (kg)',
    width: 18,
    editable: true,
    numeric: true,
    aliases: ['peso corporal', 'peso', 'peso declarado', 'bodyweight'],
  },
  { key: 'status', header: 'Estado inscripción', width: 18 },
  { key: 'paymentStatus', header: 'Estado de pago', width: 16 },
  { key: 'createdAt', header: 'Fecha de inscripción', width: 19 },
])

const MODALITY_ALIASES = Object.freeze({
  'full power': 'full_power',
  fullpower: 'full_power',
  fp: 'full_power',
  'push pull': 'push_pull',
  pushpull: 'push_pull',
  sentadilla: 'squat',
  squat: 'squat',
  banco: 'bench',
  'press de banca': 'bench',
  'press banca': 'bench',
  bench: 'bench',
  'bench press': 'bench',
  'peso muerto': 'deadlift',
  deadlift: 'deadlift',
})

/** Encabezado/valor comparable: minúsculas, sin tildes, sin signos. */
function plainKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll(/[_\-–—]+/g, ' ')
    .replaceAll(/[^\p{L}\p{N}()\s]+/gu, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function cellText(value) {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value).trim()
}

function calendarDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''))
  return match ? `${match[3]}/${match[2]}/${match[1]}` : ''
}

/**
 * Filas de la planilla, una por inscripción. Acepta las inscripciones como las
 * mapea el cliente (`athleteApi`): `athleteId`, `secondaryDivision`,
 * `bodyweight`, `paymentOrderId`…
 *
 * @param {{ registrations?: object[], athletes?: object[], payments?: object[], events?: object[] }} source
 * @returns {Record<string, string|number>[]}
 */
export function buildRegistrationSheetRows({
  registrations = [],
  athletes = [],
  payments = [],
  events = [],
} = {}) {
  const athletesById = new Map(athletes.map((athlete) => [athlete.id, athlete]))
  const paymentsById = new Map(payments.map((payment) => [payment.id, payment]))
  const eventsBySlug = new Map(events.map((event) => [event.slug, event]))

  return registrations.map((registration) => {
    const athlete = athletesById.get(registration.athleteId) ?? {}
    const payment = registration.paymentOrderId
      ? paymentsById.get(registration.paymentOrderId)
      : null
    const event = eventsBySlug.get(registration.eventSlug)
    const bodyweight = Number(String(registration.bodyweight ?? '').replace(',', '.'))
    return {
      registrationId: registration.id ?? '',
      event: event?.title ?? registration.event ?? registration.eventSlug ?? '',
      athlete: athlete.fullName ?? '',
      document: athlete.documentId ?? '',
      email: athlete.email ?? '',
      sex: athlete.sex ?? '',
      division: registration.division ?? '',
      secondaryDivision: registration.secondaryDivision ?? '',
      category: registration.category ?? '',
      modalities: formatModalities(registration.modalities),
      declaredWeightClass: registration.declaredWeightClass ?? '',
      bodyweightKg: Number.isFinite(bodyweight) && bodyweight > 0 ? bodyweight : '',
      status: registration.status ?? '',
      paymentStatus: payment?.status ?? registration.paymentStatus ?? '',
      createdAt: calendarDay(registration.createdAt),
    }
  })
}

/**
 * Valores válidos por columna editable, para la hoja de ayuda del archivo.
 * @returns {{ header: string, values: string }[]}
 */
export function registrationSheetAllowedValues() {
  const header = (key) => REGISTRATION_SHEET_COLUMNS.find((column) => column.key === key).header
  return [
    { header: header('division'), values: COMPETITION_DIVISIONS.join(', ') },
    { header: header('category'), values: EQUIPMENT_TYPES.join(', ') },
    {
      header: header('modalities'),
      values: `${formatModalities(REGISTRATION_MODALITIES)} (combinadas con "+"; Push-Pull no se suma a Banco ni a Peso muerto)`,
    },
    {
      header: header('declaredWeightClass'),
      values: `Mujeres: ${WOMEN_WEIGHT_CLASSES.join(' · ')} — Hombres: ${MEN_WEIGHT_CLASSES.join(' · ')}`,
    },
    {
      header: header('bodyweightKg'),
      values: `Número entre ${BODYWEIGHT_KG_RANGE.min} y ${BODYWEIGHT_KG_RANGE.max} (acepta 67,5 o 67.5)`,
    },
  ]
}

/**
 * "Full Power + Banco" → `['full_power', 'bench']`. Acepta los nombres de la
 * planilla, los códigos internos y separadores `+ , ; /`.
 * @returns {{ ok: true, modalities: string[] } | { ok: false, value: string }}
 */
export function parseModalitiesCell(value) {
  const tokens = String(value ?? '')
    .split(/[+,;/]|\s+y\s+/i)
    .map((token) => plainKey(token))
    .filter(Boolean)
  const codes = []
  for (const token of tokens) {
    const code = REGISTRATION_MODALITIES.includes(token.replaceAll(' ', '_'))
      ? token.replaceAll(' ', '_')
      : MODALITY_ALIASES[token]
    if (!code) return { ok: false, value: token }
    codes.push(code)
  }
  return { ok: true, modalities: codes }
}

/** `67,5` / `67.5 kg` / 67.5 → 67.5; vacío → null; texto → NaN. */
function parseKg(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') return value
  const raw = String(value)
    .trim()
    .replace(/\s*kg$/i, '')
    .replace(',', '.')
  if (!raw) return null
  return /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : Number.NaN
}

function findHeaderRow(sheet) {
  const idHeaders = new Set(
    [REGISTRATION_SHEET_COLUMNS[0].header, ...REGISTRATION_SHEET_COLUMNS[0].aliases].map(plainKey),
  )
  const limit = Math.min(sheet.length, 10)
  for (let index = 0; index < limit; index += 1) {
    if ((sheet[index] ?? []).some((cell) => idHeaders.has(plainKey(cell)))) return index
  }
  return -1
}

function columnIndexByKey(headerRow) {
  const byHeader = new Map()
  for (const column of REGISTRATION_SHEET_COLUMNS) {
    for (const name of [column.header, ...(column.aliases ?? [])]) {
      byHeader.set(plainKey(name), column.key)
    }
  }
  const indexes = {}
  const unknown = []
  headerRow.forEach((cell, index) => {
    const text = cellText(cell)
    if (!text) return
    const key = byHeader.get(plainKey(text))
    if (key && indexes[key] == null) indexes[key] = index
    else if (!key) unknown.push(text)
  })
  return { indexes, unknown }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Lee la hoja (matriz de celdas, como la devuelve `read-excel-file`) y arma lo
 * que viaja a la API. Normaliza lo que se puede leer sin contexto (alias de
 * división, modalidades, coma decimal); el resto lo decide el servidor.
 *
 * @param {unknown[][]} sheet
 * @returns {{
 *   ok: boolean,
 *   error?: 'NO_HEADER' | 'NO_EDITABLE_COLUMNS' | 'EMPTY' | 'TOO_MANY_ROWS',
 *   rows: { row: number, registrationId: string, values: Record<string, unknown> }[],
 *   issues: { row: number, field: string, code: string, value?: string }[],
 *   columns: string[],
 *   unknownColumns: string[],
 * }}
 */
export function parseRegistrationSheet(sheet) {
  const empty = { rows: [], issues: [], columns: [], unknownColumns: [] }
  const matrix = Array.isArray(sheet) ? sheet : []
  const headerIndex = findHeaderRow(matrix)
  if (headerIndex < 0) return { ok: false, error: 'NO_HEADER', ...empty }

  const { indexes, unknown } = columnIndexByKey(matrix[headerIndex])
  const editable = REGISTRATION_SHEET_EDITABLE_FIELDS.filter((key) => indexes[key] != null)
  const columns = REGISTRATION_SHEET_COLUMNS.map((column) => column.key).filter(
    (key) => indexes[key] != null,
  )
  if (editable.length === 0) {
    return { ok: false, error: 'NO_EDITABLE_COLUMNS', ...empty, columns, unknownColumns: unknown }
  }

  const rows = []
  const issues = []
  const seen = new Map()
  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const cells = matrix[index] ?? []
    // Número de fila como lo ve Excel (1-based).
    const row = index + 1
    if (!cells.some((cell) => cellText(cell))) continue

    const registrationId = cellText(cells[indexes.registrationId])
    if (!UUID.test(registrationId)) {
      issues.push({ row, field: 'registrationId', code: 'ID_INVALID', value: registrationId })
      continue
    }
    if (seen.has(registrationId)) {
      issues.push({
        row,
        field: 'registrationId',
        code: 'ID_DUPLICATED',
        value: String(seen.get(registrationId)),
      })
      continue
    }
    seen.set(registrationId, row)

    const values = {}
    for (const field of editable) {
      const raw = cells[indexes[field]]
      const text = cellText(raw)
      if (!text) continue
      if (field === 'division') {
        values.division = normalizeCompetitionDivision(text) || text
      } else if (field === 'category') {
        values.category = normalizeEquipment(text) || text
      } else if (field === 'modalities') {
        const parsed = parseModalitiesCell(text)
        if (!parsed.ok) {
          issues.push({ row, field, code: 'MODALITY_INVALID', value: parsed.value })
          continue
        }
        values.modalities = parsed.modalities
      } else if (field === 'declaredWeightClass') {
        values.declaredWeightClass =
          canonicalDeclaredWeightClass(typeof raw === 'number' ? String(raw) : text) || text
      } else if (field === 'bodyweightKg') {
        const kg = parseKg(raw)
        if (Number.isNaN(kg)) {
          issues.push({ row, field, code: 'BODYWEIGHT_INVALID', value: text })
          continue
        }
        values.bodyweightKg = kg
      }
    }
    rows.push({ row, registrationId, values })
  }

  if (rows.length === 0 && issues.length === 0) {
    return { ok: false, error: 'EMPTY', rows, issues, columns, unknownColumns: unknown }
  }
  if (rows.length > REGISTRATION_IMPORT_MAX_ROWS) {
    return { ok: false, error: 'TOO_MANY_ROWS', rows: [], issues, columns, unknownColumns: unknown }
  }
  return { ok: true, rows, issues, columns, unknownColumns: unknown }
}

function sameKg(left, right) {
  if (left == null || right == null) return left == null && right == null
  return Math.abs(Number(left) - Number(right)) < 0.001
}

function sameList(left = [], right = []) {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

/**
 * Compara una fila importada contra la inscripción guardada y valida cada
 * cambio con las mismas reglas que el checkout y la corrección de staff.
 *
 * `current` es la inscripción normalizada por el servidor: `division`,
 * `secondaryDivision`, `category`, `modalities`, `declaredWeightClass`,
 * `bodyweightKg`, `status`, `sex`, `rosterFrozen`, `offering`.
 *
 * Solo se validan contra la oferta del evento los valores que cambian: un dato
 * viejo que hoy quedó fuera de la oferta no bloquea corregir otra columna.
 *
 * @returns {{
 *   changes: { field: string, from: unknown, to: unknown }[],
 *   errors: { field: string, code: string, value?: string }[],
 *   warnings: { field: string, code: string }[],
 *   next: { division: string, category: string, modalities: string[], declaredWeightClass: string, bodyweightKg: number|null },
 * }}
 */
export function diffRegistrationImportRow(current, values = {}) {
  const changes = []
  const errors = []
  const warnings = []
  const next = {
    division: current.division ?? '',
    category: current.category ?? '',
    modalities: normalizeModalities(
      current.modalities?.length ? current.modalities : ['full_power'],
    ),
    declaredWeightClass: current.declaredWeightClass ?? '',
    bodyweightKg: current.bodyweightKg ?? null,
  }

  if (values.division != null) {
    const division = normalizeCompetitionDivision(values.division)
    if (!division) {
      errors.push({ field: 'division', code: 'DIVISION_INVALID', value: String(values.division) })
    } else if (division !== next.division) {
      if (current.secondaryDivision && division === current.secondaryDivision) {
        // El trigger descartaría la segunda división, que ya se cobró aparte.
        errors.push({ field: 'division', code: 'DIVISION_EQUALS_SECONDARY', value: division })
      } else if (!validateSelectionAgainstOffering({ division }, current.offering).ok) {
        errors.push({ field: 'division', code: 'OFFERING_DIVISION_UNAVAILABLE', value: division })
      } else {
        changes.push({ field: 'division', from: next.division, to: division })
        next.division = division
      }
    }
  }

  if (values.category != null) {
    const category = normalizeEquipment(values.category)
    if (!category) {
      errors.push({ field: 'category', code: 'CATEGORY_INVALID', value: String(values.category) })
    } else if (category !== next.category) {
      if (!validateSelectionAgainstOffering({ category }, current.offering).ok) {
        errors.push({ field: 'category', code: 'OFFERING_CATEGORY_UNAVAILABLE', value: category })
      } else {
        changes.push({ field: 'category', from: next.category, to: category })
        next.category = category
      }
    }
  }

  if (values.modalities != null) {
    const result = validateModalities(values.modalities)
    if (!result.ok) {
      errors.push({ field: 'modalities', code: result.code })
    } else if (!sameList(result.modalities, next.modalities)) {
      const offered = validateSelectionAgainstOffering(
        { modalities: result.modalities },
        current.offering,
      )
      if (!offered.ok) {
        errors.push({ field: 'modalities', code: offered.code, value: offered.value })
      } else {
        changes.push({ field: 'modalities', from: next.modalities, to: result.modalities })
        next.modalities = result.modalities
      }
    }
  }

  if (values.declaredWeightClass != null) {
    const raw = String(values.declaredWeightClass)
    const weightClass = canonicalDeclaredWeightClass(raw)
    if (!weightClass || !isDeclaredWeightClassForSex(current.sex, weightClass)) {
      errors.push({ field: 'declaredWeightClass', code: 'WEIGHT_CLASS_INVALID', value: raw })
    } else if (weightClass !== next.declaredWeightClass) {
      changes.push({
        field: 'declaredWeightClass',
        from: next.declaredWeightClass,
        to: weightClass,
      })
      next.declaredWeightClass = weightClass
    }
  }

  if (values.bodyweightKg != null) {
    const kg = Number(values.bodyweightKg)
    if (!isValidBodyweightKg(kg)) {
      errors.push({
        field: 'bodyweightKg',
        code: 'BODYWEIGHT_INVALID',
        value: String(values.bodyweightKg),
      })
    } else if (!sameKg(kg, next.bodyweightKg)) {
      changes.push({ field: 'bodyweightKg', from: next.bodyweightKg, to: kg })
      next.bodyweightKg = kg
    }
  }

  if (changes.length > 0) {
    if (current.status === 'cancelada') {
      errors.push({ field: 'status', code: 'REGISTRATION_CANCELLED' })
    }
    if (current.rosterFrozen) {
      errors.push({ field: 'status', code: 'ROSTER_FROZEN' })
    }
    // La corrección de división/categoría/peso viaja junta y exige un peso.
    const competitionChanged = changes.some((change) =>
      ['division', 'category', 'bodyweightKg'].includes(change.field),
    )
    if (competitionChanged && !isValidBodyweightKg(next.bodyweightKg)) {
      errors.push({ field: 'bodyweightKg', code: 'BODYWEIGHT_REQUIRED' })
    }
    const warning = getWeightClassWarning(next.bodyweightKg, next.declaredWeightClass)
    if (warning) warnings.push({ field: 'bodyweightKg', code: warning.code })
  }

  return { changes, errors, warnings, next }
}
