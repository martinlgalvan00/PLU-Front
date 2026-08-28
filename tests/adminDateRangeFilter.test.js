import { describe, expect, it } from 'vitest'
import {
  EMPTY_DATE_RANGE,
  activeDateRangePresetId,
  dateRangePreset,
  matchesDateRange,
  toLocalISODate,
} from '../src/lib/adminDateRangeFilter.js'

describe('matchesDateRange', () => {
  it('acepta todo si el rango está vacío', () => {
    expect(matchesDateRange('2026-08-10T12:00:00Z', EMPTY_DATE_RANGE)).toBe(true)
    expect(matchesDateRange(null, { from: '', to: '' })).toBe(true)
    expect(matchesDateRange(undefined, null)).toBe(true)
  })

  it('excluye filas sin fecha cuando hay rango activo', () => {
    expect(matchesDateRange(null, { from: '2026-08-01', to: '' })).toBe(false)
    expect(matchesDateRange('', { from: '', to: '2026-08-31' })).toBe(false)
  })

  it('filtra inclusive por from/to sobre el día ISO', () => {
    expect(matchesDateRange('2026-08-10T23:59:59Z', { from: '2026-08-10', to: '2026-08-10' })).toBe(
      true,
    )
    expect(matchesDateRange('2026-08-09T12:00:00Z', { from: '2026-08-10', to: '' })).toBe(false)
    expect(matchesDateRange('2026-08-11T12:00:00Z', { from: '', to: '2026-08-10' })).toBe(false)
    expect(matchesDateRange('2026-08-15T08:00:00Z', { from: '2026-08-01', to: '2026-08-31' })).toBe(
      true,
    )
  })
})

describe('dateRangePreset', () => {
  const now = new Date(2026, 7, 27) // 27 ago 2026 local

  it('arma últimos 7 / 30 días inclusivos y este mes', () => {
    expect(dateRangePreset('last7', now)).toEqual({ from: '2026-08-21', to: '2026-08-27' })
    expect(dateRangePreset('last30', now)).toEqual({ from: '2026-07-29', to: '2026-08-27' })
    expect(dateRangePreset('thisMonth', now)).toEqual({ from: '2026-08-01', to: '2026-08-27' })
  })

  it('detecta el preset activo exacto', () => {
    expect(activeDateRangePresetId(dateRangePreset('last7', now), now)).toBe('last7')
    expect(activeDateRangePresetId({ from: '2026-08-01', to: '2026-08-15' }, now)).toBe(null)
    expect(activeDateRangePresetId(EMPTY_DATE_RANGE, now)).toBe(null)
  })

  it('formatea fecha local sin UTC shift', () => {
    expect(toLocalISODate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
