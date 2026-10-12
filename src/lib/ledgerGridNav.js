/**
 * Navegación por teclado de la grilla del libro de caja.
 *
 * La grilla no tiene su propio modelo de filas: las celdas son los elementos
 * `[data-ledger-cell]` que la tabla ya renderiza, y "arriba/abajo" se resuelve
 * con el DOM. Así el orden que se ve (ordenado, paginado, filtrado) es el que
 * recorren las flechas, sin duplicar el estado de la tabla.
 */

export const LEDGER_CELL_SELECTOR = '[data-ledger-cell]'

function cellsOfRow(row) {
  return [...row.querySelectorAll(LEDGER_CELL_SELECTOR)]
}

function siblingRowWithCells(row, step) {
  let candidate = step > 0 ? row.nextElementSibling : row.previousElementSibling
  while (candidate) {
    if (candidate.querySelector(LEDGER_CELL_SELECTOR)) return candidate
    candidate = step > 0 ? candidate.nextElementSibling : candidate.previousElementSibling
  }
  return null
}

/**
 * Enfoca la celda vecina. `rowStep` / `colStep` valen -1, 0 o 1.
 * Devuelve true si el foco se movió (false en el borde de la grilla).
 */
export function moveLedgerFocus(cell, { rowStep = 0, colStep = 0 } = {}) {
  const row = cell?.closest('tr')
  if (!row) return false
  const cells = cellsOfRow(row)
  const index = cells.indexOf(cell)
  if (index === -1) return false

  let target = null
  if (rowStep !== 0) {
    const nextRow = siblingRowWithCells(row, rowStep)
    target = nextRow ? cellsOfRow(nextRow)[index] : null
  } else if (colStep !== 0) {
    target = cells[index + colStep] ?? null
  }
  if (!target) return false
  target.focus()
  return true
}

/** Primera / última celda de la fila (Inicio / Fin). */
export function focusLedgerRowEdge(cell, edge) {
  const row = cell?.closest('tr')
  if (!row) return false
  const cells = cellsOfRow(row)
  const target = edge === 'end' ? cells.at(-1) : cells[0]
  if (!target) return false
  target.focus()
  return true
}
