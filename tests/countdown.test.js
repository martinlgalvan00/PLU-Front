import { describe, expect, it } from 'vitest'
import { getCountdownParts } from '../src/lib/countdown.js'

describe('getCountdownParts', () => {
  it('desglosa más de un día con timezone ISO -03:00', () => {
    const now = new Date('2026-08-12T12:00:00-03:00')
    const endsAt = '2026-08-28T23:59:59-03:00'
    const parts = getCountdownParts(endsAt, now)

    expect(parts.expired).toBe(false)
    expect(parts.days).toBe(16)
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
      days: 0,
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
