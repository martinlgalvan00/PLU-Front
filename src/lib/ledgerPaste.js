/**
 * Parser del pegado desde Excel / Google Sheets para el libro de caja.
 *
 * Una selección copiada de una planilla llega como texto con tabuladores entre
 * celdas y saltos de línea entre filas. Columnas aceptadas, en este orden:
 *
 *   fecha · categoría · detalle · importe [· tipo]
 *   categoría · detalle · importe            (sin fecha: se usa hoy)
 *
 * El tipo (ingreso / egreso) sale de la quinta columna; sin ella, un importe
 * negativo es egreso y el resto toma el tipo elegido en la fila de carga.
 * Una primera fila con títulos ("Fecha", "Categoría"…) se descarta sola.
 *
 * Es lógica pura: no toca el DOM ni la red, así que se prueba sin render. Los
 * límites repiten los del backend (`entrySchema` en `server/routes/finance.js`);
 * el servidor sigue siendo quien valida de verdad.
 */

export const LEDGER_PASTE_MAX_ROWS = 200

const CATEGORY_LIMITS = { min: 2, max: 80 }
const DESCRIPTION_LIMITS = { min: 3, max: 500 }
const AMOUNT_MAX = 100_000_000

const INCOME_WORDS = new Set(['ingreso', 'ingresos', 'entrada', 'income', '+'])
const EXPENSE_WORDS = new Set(['egreso', 'egresos', 'gasto', 'salida', 'expense', '-'])
const HEADER_WORDS = /fecha|date|categor|rubro|detalle|descrip|concepto|import|monto|tipo/i

function pad(value) {
  return String(value).padStart(2, '0')
}

function isRealDate(year, month, day) {
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  )
}

/** `dd/mm/aaaa`, `dd-mm-aa`, `aaaa-mm-dd` → `aaaa-mm-dd`, o null si no es una fecha real. */
export function parseLedgerDate(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return null

  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/)
  if (match) {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
    return isRealDate(year, month, day) ? `${year}-${pad(month)}-${pad(day)}` : null
  }

  match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/)
  if (match) {
    const day = Number(match[1])
    const month = Number(match[2])
    let year = Number(match[3])
    if (match[3].length === 2) year += 2000
    return isRealDate(year, month, day) ? `${year}-${pad(month)}-${pad(day)}` : null
  }
  return null
}

/**
 * Importe en formato argentino o inglés → número, o null si no se entiende.
 * `1.500,50` y `1,500.50` dan 1500.5; `1.500` (un punto, tres dígitos) es mil
 * quinientos, no uno con cincuenta.
 */
export function parseLedgerAmount(raw) {
  let text = String(raw ?? '')
    .replace(/[$\s ]|ARS/gi, '')
    .trim()
  if (!text) return null

  let negative = false
  if (/^\(.*\)$/.test(text)) {
    negative = true
    text = text.slice(1, -1)
  }
  if (text.startsWith('-') || text.startsWith('−')) {
    negative = true
    text = text.slice(1)
  }
  if (!/^[\d.,]+$/.test(text)) return null

  const lastDot = text.lastIndexOf('.')
  const lastComma = text.lastIndexOf(',')
  let normalized
  if (lastDot !== -1 && lastComma !== -1) {
    const decimalSeparator = lastDot > lastComma ? '.' : ','
    const thousandsSeparator = decimalSeparator === '.' ? ',' : '.'
    normalized = text.split(thousandsSeparator).join('').replace(decimalSeparator, '.')
  } else if (lastDot !== -1 || lastComma !== -1) {
    const separator = lastDot !== -1 ? '.' : ','
    const parts = text.split(separator)
    const looksLikeThousands =
      parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3)
    normalized = looksLikeThousands ? parts.join('') : `${parts[0]}.${parts[1]}`
  } else {
    normalized = text
  }

  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  return negative ? -value : value
}

function parseKind(raw) {
  const word = String(raw ?? '').trim().toLowerCase()
  if (INCOME_WORDS.has(word)) return 'income'
  if (EXPENSE_WORDS.has(word)) return 'expense'
  return null
}

function splitLine(line, delimiter) {
  return line.split(delimiter).map((cell) => cell.trim())
}

function detectDelimiter(lines) {
  if (lines.some((line) => line.includes('\t'))) return '\t'
  if (lines.some((line) => line.includes(';'))) return ';'
  return null
}

function looksLikeHeader(cells) {
  const hits = cells.filter((cell) => cell && HEADER_WORDS.test(cell) && !/\d/.test(cell))
  return hits.length >= 2
}

function validateText(value, limits) {
  const length = value.trim().length
  return length >= limits.min && length <= limits.max
}

/**
 * ¿El texto pegado es una grilla (varias celdas o filas) y no un valor suelto?
 * Un valor de una sola celda se deja pegar normal en el campo donde cayó.
 */
export function isLedgerGridPaste(text) {
  const trimmed = String(text ?? '').replace(/[\r\n]+$/, '')
  if (!trimmed) return false
  return trimmed.includes('\t') || /\r?\n/.test(trimmed)
}

/**
 * @param {string} text Texto del portapapeles.
 * @param {{ defaultKind?: 'income'|'expense', today?: string }} [options]
 * @returns {{
 *   rows: Array<{
 *     line: number, kind: 'income'|'expense', occurredOn: string|null,
 *     category: string, description: string, amount: number|null,
 *     errors: Array<'date'|'category'|'description'|'amount'|'kind'>,
 *   }>,
 *   hadHeader: boolean,
 *   truncated: boolean,
 * }}
 */
export function parseLedgerPaste(text, { defaultKind = 'income', today } = {}) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line) => line.trim() !== '')
  if (lines.length === 0) return { rows: [], hadHeader: false, truncated: false }

  const delimiter = detectDelimiter(lines)
  if (!delimiter) return { rows: [], hadHeader: false, truncated: false }

  const table = lines.map((line) => splitLine(line, delimiter))
  const hadHeader = looksLikeHeader(table[0])
  const body = hadHeader ? table.slice(1) : table
  const truncated = body.length > LEDGER_PASTE_MAX_ROWS
  const todayIso = today ?? `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}-${pad(new Date().getDate())}`

  const rows = body.slice(0, LEDGER_PASTE_MAX_ROWS).map((cells, index) => {
    const errors = []
    // Con 3 columnas no hay fecha; con 4 o más la primera es la fecha.
    const hasDate = cells.length >= 4
    const [dateCell, categoryCell, descriptionCell, amountCell, kindCell] = hasDate
      ? cells
      : ['', cells[0], cells[1], cells[2], cells[3]]

    const occurredOn = hasDate ? parseLedgerDate(dateCell) : todayIso
    if (!occurredOn) errors.push('date')

    const category = (categoryCell ?? '').trim()
    if (!validateText(category, CATEGORY_LIMITS)) errors.push('category')

    const description = (descriptionCell ?? '').trim()
    if (!validateText(description, DESCRIPTION_LIMITS)) errors.push('description')

    const parsedAmount = parseLedgerAmount(amountCell)
    const rounded = parsedAmount == null ? null : Math.round(Math.abs(parsedAmount))
    if (rounded == null || rounded <= 0 || rounded > AMOUNT_MAX) errors.push('amount')

    let kind = defaultKind
    const explicitKind = kindCell !== undefined && kindCell !== '' ? parseKind(kindCell) : null
    if (kindCell !== undefined && kindCell !== '' && !explicitKind) errors.push('kind')
    if (explicitKind) kind = explicitKind
    else if (parsedAmount != null && parsedAmount < 0) kind = 'expense'

    return {
      line: index + 1 + (hadHeader ? 1 : 0),
      kind,
      occurredOn,
      category,
      description,
      amount: rounded,
      errors,
    }
  })

  return { rows, hadHeader, truncated }
}
