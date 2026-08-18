import { describe, expect, it } from 'vitest'
import { resolveComboDeal } from '../src/lib/eventPricing.js'

describe('resolveComboDeal', () => {
  it('calcula ahorro y 20% sobre 75k + 75k a 120k', () => {
    expect(
      resolveComboDeal({
        membership: 75000,
        registration: 75000,
        combo: 120000,
      }),
    ).toEqual({
      membership: 75000,
      registration: 75000,
      combo: 120000,
      separate: 150000,
      savings: 30000,
      percent: 20,
      live: true,
    })
  })

  it('no marca live si el combo no descuenta', () => {
    expect(
      resolveComboDeal({
        membership: 75000,
        registration: 75000,
        combo: 150000,
      }).live,
    ).toBe(false)
  })

  it('ignora montos inválidos', () => {
    expect(resolveComboDeal({ membership: 0, registration: 75000, combo: 120000 }).live).toBe(false)
  })
})
