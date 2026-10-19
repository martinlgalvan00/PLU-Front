/**
 * Persistencia local del studio Lifters (opciones de export por admin/browser).
 */

import {
  DEFAULT_LIFTERS_EXPORT_OPTIONS,
  normalizeLiftersExportOptions,
} from '../../shared/liftersExport.js'

export const LIFTERS_EXPORT_STUDIO_STORAGE_KEY = 'plu-lifters-export-options-v1'

export function loadLiftersExportStudioOptions() {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_LIFTERS_EXPORT_OPTIONS }
  }
  try {
    const raw = window.localStorage.getItem(LIFTERS_EXPORT_STUDIO_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_LIFTERS_EXPORT_OPTIONS }
    return normalizeLiftersExportOptions(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_LIFTERS_EXPORT_OPTIONS }
  }
}

export function saveLiftersExportStudioOptions(options) {
  const normalized = normalizeLiftersExportOptions(options)
  if (typeof window === 'undefined') return normalized
  try {
    window.localStorage.setItem(LIFTERS_EXPORT_STUDIO_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // Quota / private mode: seguimos con el valor en memoria.
  }
  return normalized
}

/** Query params seguros para el endpoint de export. */
export function liftersExportOptionsToQuery(options) {
  const opts = normalizeLiftersExportOptions(options)
  const params = {
    preset: opts.preset,
    rowFilter: opts.rowFilter,
    highlightEmpty: opts.highlightEmpty ? '1' : '0',
    freezeHeader: opts.freezeHeader ? '1' : '0',
  }
  if (opts.columns?.length) {
    params.columns = opts.columns.join(',')
  }
  return params
}
