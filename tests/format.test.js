import { describe, expect, it } from 'vitest'
import { formatPromoDeadline, money, splitFullName, generateId } from '../src/lib/format.js'

describe('format', () => {
  it('formatea moneda ARS', () => {
    expect(money(75000)).toContain('75')
  })

  it('divide nombre completo', () => {
    expect(splitFullName('Martina Rivas')).toEqual({
      firstName: 'Martina',
      lastName: 'Rivas',
    })
  })

  it('genera ids con padding', () => {
    expect(generateId('ath', 1)).toBe('ath-001')
  })

  it('formatea el cierre de promo con día de la semana', () => {
    expect(formatPromoDeadline('2026-08-28T23:59:59-03:00')).toMatch(/viernes/i)
    expect(formatPromoDeadline('2026-08-28T23:59:59-03:00')).toMatch(/28/)
    expect(formatPromoDeadline('2026-08-28T23:59:59-03:00')).toMatch(/agosto/i)
    expect(formatPromoDeadline('2026-08-28T23:59:59-03:00', 'en')).toMatch(/Friday/i)
    expect(formatPromoDeadline('2026-08-29T02:59:59.000Z')).toMatch(/viernes/i)
  })
})
