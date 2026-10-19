import {
  buildAdminExportRows,
  buildPluUsaExportRows,
  normalizeExportDate,
  serializeCsv,
  serializeSpreadsheet,
} from '../../shared/exportRows.js'

export {
  buildAdminExportRows,
  buildPluUsaExportRows,
  normalizeExportDate,
  serializeCsv,
  serializeSpreadsheet,
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function createCsv(filename, rows) {
  const csv = serializeCsv(rows)
  if (!csv) return false

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, filename)
  return true
}

/** SpreadsheetML 2003 (.xls) que Excel, Numbers y Sheets abren sin dependencias. */
export function createSpreadsheet(filename, rows, sheetName = 'Hoja1', options = {}) {
  const xml = serializeSpreadsheet(rows, sheetName, options)
  if (!xml) return false

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  triggerDownload(blob, filename)
  return true
}

/** Dispara descarga de un Blob ya armado (respuesta de API). */
export function downloadBlob(blob, filename) {
  if (!blob) return false
  triggerDownload(blob, filename)
  return true
}
