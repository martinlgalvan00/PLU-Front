import { describe, expect, it } from 'vitest'
import { money, splitFullName, generateId } from '../src/lib/format.js'

describe('format', () => {
  it('formatea moneda ARS', () => {
    expect(money(38000)).toContain('38')
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
})
