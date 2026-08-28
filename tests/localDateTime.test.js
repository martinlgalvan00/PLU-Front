import { describe, expect, it } from 'vitest'
import {
  documentLangForLocale,
  formatDateText,
  formatTimeText,
  isDayFirstLocale,
  maskDateInput,
  maskTimeInput,
  parseDateText,
  parseTimeText,
  splitIsoLocal,
  toIsoLocal,
} from '../src/lib/localDateTime.js'

describe('localDateTime', () => {
  it('en es-AR el día va primero', () => {
    expect(isDayFirstLocale('es')).toBe(true)
    expect(isDayFirstLocale('en')).toBe(false)
    expect(documentLangForLocale('es')).toBe('es-AR')
  })

  it('muestra 03/09/2026 a partir de 2026-09-03T07:48', () => {
    const parts = splitIsoLocal('2026-09-03T07:48')
    expect(formatDateText(parts, true)).toBe('03/09/2026')
    expect(formatTimeText(parts)).toBe('07:48')
  })

  it('en inglés muestra mes/día', () => {
    const parts = splitIsoLocal('2026-09-03T07:48')
    expect(formatDateText(parts, false)).toBe('09/03/2026')
  })

  it('parsea día/mes y arma el valor canónico', () => {
    const date = parseDateText('03/09/2026', true)
    const time = parseTimeText('07:48')
    expect(toIsoLocal(date, time)).toBe('2026-09-03T07:48')
  })

  it('rechaza el 31 de febrero', () => {
    expect(parseDateText('31/02/2026', true)).toBeNull()
  })

  it('enmascara la fecha mientras se tipea', () => {
    expect(maskDateInput('0309')).toBe('03/09')
    expect(maskDateInput('03092026')).toBe('03/09/2026')
    expect(maskTimeInput('0748')).toBe('07:48')
  })
})
