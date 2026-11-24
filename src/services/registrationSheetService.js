import { apiPost } from '../lib/api.js'
import {
  buildRegistrationSheetRows,
  parseRegistrationSheet,
  REGISTRATION_IMPORT_BATCH_SIZE,
  REGISTRATION_SHEET_COLUMNS,
  REGISTRATION_SHEET_HELP_NAME,
  REGISTRATION_SHEET_NAME,
  registrationSheetAllowedValues,
} from '../../shared/registrationSheet.js'

/*
 * Planilla de inscripciones (.xlsx): exportar lo que muestra la tabla y
 * volver a subirla para corregir datos competitivos. Las librerías de Excel
 * se cargan recién al usar la función (no pesan en el resto del panel).
 */

// Paleta del archivo, no del sitio: Excel no lee tokens CSS. Encabezado
// grafito y columnas editables con el oro PLU apagado, legibles en impresión.
const HEADER_STYLE = {
  fontWeight: 'bold',
  textColor: '#FFFFFF',
  backgroundColor: '#23262B',
  alignVertical: 'center',
  height: 26,
}
const EDITABLE_HEADER_STYLE = { ...HEADER_STYLE, textColor: '#1B1D21', backgroundColor: '#F2C94C' }
const EDITABLE_CELL_STYLE = { backgroundColor: '#FFF8E1' }
const LOCKED_CELL_STYLE = { textColor: '#5B6068' }

/** Hojas del archivo: la planilla y una de ayuda con los valores válidos. */
export function buildRegistrationWorkbook(rows) {
  const header = REGISTRATION_SHEET_COLUMNS.map((column) => ({
    value: column.editable ? `${column.header} ✎` : column.header,
    ...(column.editable ? EDITABLE_HEADER_STYLE : HEADER_STYLE),
  }))
  const body = rows.map((row) =>
    REGISTRATION_SHEET_COLUMNS.map((column) => {
      const value = row[column.key]
      const style = column.editable ? EDITABLE_CELL_STYLE : LOCKED_CELL_STYLE
      if (column.numeric && typeof value === 'number') {
        return { value, type: Number, format: '0.0#', ...style }
      }
      return { value: value === '' || value == null ? '' : String(value), type: String, ...style }
    }),
  )

  const title = { fontWeight: 'bold', fontSize: 13 }
  const label = { fontWeight: 'bold' }
  const help = [
    [{ value: 'Cómo editar esta planilla', ...title }],
    [''],
    ['1. Editá solo las columnas marcadas con ✎ (fondo amarillo).'],
    ['2. No cambies la columna "ID inscripción": identifica cada fila.'],
    ['3. Una celda editable vacía no borra nada: deja el dato como está.'],
    ['4. Guardá como .xlsx y subilo en Inscripciones → Importar planilla.'],
    ['5. Antes de aplicar vas a ver los cambios fila por fila.'],
    [''],
    [
      { value: 'Columna', ...label },
      { value: 'Valores válidos', ...label },
    ],
    ...registrationSheetAllowedValues().map((item) => [item.header, item.values]),
    [''],
    [
      {
        value:
          'No se editan desde acá: segunda división (cambia el precio), estado y pago (pasan por Cobros).',
        fontStyle: 'italic',
      },
    ],
  ]

  return [
    {
      sheet: REGISTRATION_SHEET_NAME,
      data: [header, ...body],
      columns: REGISTRATION_SHEET_COLUMNS.map((column) => ({ width: column.width })),
      stickyRowsCount: 1,
      stickyColumnsCount: 0,
    },
    {
      sheet: REGISTRATION_SHEET_HELP_NAME,
      data: help,
      columns: [{ width: 24 }, { width: 96 }],
    },
  ]
}

function sheetFilename(scope) {
  const slug = String(scope ?? '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')
  const day = new Date().toISOString().slice(0, 10)
  return `inscripciones${slug ? `-${slug}` : ''}-${day}.xlsx`
}

/**
 * Descarga la planilla de las inscripciones dadas (las que muestra la tabla,
 * con sus filtros).
 * @returns {Promise<{ ok: boolean, rows: number }>}
 */
export async function downloadRegistrationSheet({
  registrations = [],
  athletes = [],
  payments = [],
  events = [],
  scope = '',
} = {}) {
  const rows = buildRegistrationSheetRows({ registrations, athletes, payments, events })
  if (!rows.length) return { ok: false, rows: 0 }
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  await writeXlsxFile(buildRegistrationWorkbook(rows)).toFile(sheetFilename(scope))
  return { ok: true, rows: rows.length }
}

/**
 * Lee el archivo subido: la hoja "Inscripciones" o, si no está, la primera.
 * @param {File|Blob} file
 */
export async function readRegistrationSheetFile(file) {
  const { default: readXlsxFile } = await import('read-excel-file/browser')
  let sheets
  try {
    sheets = await readXlsxFile(file)
  } catch {
    return { ok: false, error: 'UNREADABLE', rows: [], issues: [], columns: [], unknownColumns: [] }
  }
  const sheet = sheets.find((item) => item.sheet === REGISTRATION_SHEET_NAME) ??
    sheets[0] ?? { data: [] }
  return parseRegistrationSheet(sheet.data)
}

async function postInBatches(rows, { apply, eventSlug, onProgress }) {
  const merged = {
    applied: apply,
    summary: { total: 0, changed: 0, unchanged: 0, invalid: 0, applied: 0, failed: 0 },
    rows: [],
  }
  for (let index = 0; index < rows.length; index += REGISTRATION_IMPORT_BATCH_SIZE) {
    const batch = rows.slice(index, index + REGISTRATION_IMPORT_BATCH_SIZE)
    const result = await apiPost('/api/athletes/admin/registrations/import', {
      apply,
      eventSlug: eventSlug || null,
      rows: batch,
    })
    for (const key of Object.keys(merged.summary)) {
      merged.summary[key] += result.summary?.[key] ?? 0
    }
    merged.rows.push(...(result.rows ?? []))
    onProgress?.(Math.min(index + batch.length, rows.length), rows.length)
  }
  return merged
}

/** Qué cambiaría cada fila, sin guardar nada. */
export function previewRegistrationImport(rows, options = {}) {
  return postInBatches(rows, { ...options, apply: false })
}

/**
 * Aplica solo las filas que la vista previa dio como válidas y con cambios:
 * si alguien editó la inscripción en el medio, el servidor vuelve a comparar.
 */
export function applyRegistrationImport(rows, options = {}) {
  return postInBatches(rows, { ...options, apply: true })
}
