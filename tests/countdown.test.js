import { describe, expect, it } from 'vitest'
import {
  getCountdownCells,
  getCountdownHeadline,
  getCountdownParts,
  resolveEventStartsAt,
} from '../src/lib/countdown.js'

describe('getCountdownParts', () => {
  it('desglosa más de un día con timezone ISO -03:00', () => {
    const now = new Date('2026-08-12T12:00:00-03:00')
    const endsAt = '2026-08-28T23:59:59-03:00'
    const parts = getCountdownParts(endsAt, now)

    expect(parts.expired).toBe(false)
    expect(parts.days).toBe(16)
    expect(parts.weeks).toBe(2)
    expect(parts.daysRemainder).toBe(2)
    expect(parts.hours).toBe(11)
    expect(parts.minutes).toBe(59)
    expect(parts.seconds).toBe(59)
    expect(parts.totalMs).toBeGreaterThan(0)
  })

  it('desglosa menos de una hora', () => {
    const now = new Date('2026-08-28T23:30:00-03:00')
    const endsAt = '2026-08-28T23:59:59-03:00'
    const parts = getCountdownParts(endsAt, now)

    expect(parts.expired).toBe(false)
    expect(parts.days).toBe(0)
    expect(parts.hours).toBe(0)
    expect(parts.minutes).toBe(29)
    expect(parts.seconds).toBe(59)
  })

  it('marca expired cuando endsAt ya pasó', () => {
    const now = new Date('2026-08-29T00:00:00-03:00')
    const endsAt = '2026-08-28T23:59:59-03:00'
    const parts = getCountdownParts(endsAt, now)

    expect(parts).toEqual({
      totalMs: 0,
      weeks: 0,
      days: 0,
      daysRemainder: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      expired: true,
    })
  })

  it('marca expired en el instante exacto de corte', () => {
    const endsAt = '2026-08-28T23:59:59-03:00'
    const now = new Date(endsAt)
    const parts = getCountdownParts(endsAt, now)

    expect(parts.expired).toBe(true)
    expect(parts.totalMs).toBe(0)
  })

  it('trata fechas inválidas como expired', () => {
    expect(getCountdownParts(null).expired).toBe(true)
    expect(getCountdownParts('no-es-fecha').expired).toBe(true)
  })
})

describe('getCountdownHeadline', () => {
  const endsAt = '2026-10-10T09:00:00-03:00'
  const headline = (nowIso) => getCountdownHeadline(getCountdownParts(endsAt, new Date(nowIso)))

  it('usa semanas mientras falte al menos una y se actualiza semana a semana', () => {
    expect(headline('2026-08-15T09:00:00-03:00')).toEqual({ unit: 'weeks', value: 8 })
    expect(headline('2026-08-22T09:00:00-03:00')).toEqual({ unit: 'weeks', value: 7 })
    expect(headline('2026-10-03T09:00:00-03:00')).toEqual({ unit: 'weeks', value: 1 })
  })

  it('pasa a días en la última semana y a horas en el último día', () => {
    expect(headline('2026-10-04T09:00:00-03:00')).toEqual({ unit: 'days', value: 6 })
    expect(headline('2026-10-09T15:00:00-03:00')).toEqual({ unit: 'hours', value: 18 })
  })

  it('nunca muestra 0 horas antes de que termine', () => {
    expect(headline('2026-10-10T08:30:00-03:00')).toEqual({ unit: 'hours', value: 1 })
  })
})

describe('resolveEventStartsAt', () => {
  it('prioriza startsAt, cae a dateISO a las 09:00 de Argentina y devuelve null sin fecha', () => {
    expect(
      resolveEventStartsAt({ startsAt: '2026-10-10T10:00:00-03:00', dateISO: '2026-10-11' }),
    ).toBe('2026-10-10T10:00:00-03:00')
    expect(resolveEventStartsAt({ dateISO: '2026-10-10' })).toBe('2026-10-10T09:00:00-03:00')
    expect(resolveEventStartsAt({})).toBeNull()
    expect(resolveEventStartsAt(null)).toBeNull()
  })
})

describe('getCountdownCells', () => {
  const endsAt = '2026-10-10T09:00:00-03:00'
  const cells = (nowIso) => getCountdownCells(getCountdownParts(endsAt, new Date(nowIso)))

  it('arranca en semanas, igual que el titular, y sigue con días y horas', () => {
    expect(cells('2026-08-15T07:00:00-03:00')).toEqual([
      { unit: 'weeks', value: 8 },
      { unit: 'days', value: 0 },
      { unit: 'hours', value: 2 },
    ])
  })

  it('pasa a días · horas · min en la última semana', () => {
    expect(cells('2026-10-04T08:00:00-03:00').map((cell) => cell.unit)).toEqual([
      'days',
      'hours',
      'minutes',
    ])
  })

  it('en el último día muestra horas · min · seg', () => {
    expect(cells('2026-10-09T15:30:20-03:00')).toEqual([
      { unit: 'hours', value: 17 },
      { unit: 'minutes', value: 29 },
      { unit: 'seconds', value: 40 },
    ])
  })
})
