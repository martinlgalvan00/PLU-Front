import { describe, expect, it } from 'vitest'
import {
  checkoutWindowLimitsInUnit,
  isCheckoutWindowDraftValid,
  splitCheckoutWindowMinutes,
  toCheckoutWindowMinutes,
} from '../src/lib/checkoutWindowUnits.js'

describe('plazos de cobro en minutos, horas y días', () => {
  it('5 días son 7200 minutos, que es lo que guarda el barrido', () => {
    expect(toCheckoutWindowMinutes(5, 'days')).toBe(7200)
    expect(toCheckoutWindowMinutes(2, 'hours')).toBe(120)
    expect(toCheckoutWindowMinutes(30, 'minutes')).toBe(30)
  })

  it('lee 7200 minutos como 5 días y 120 como 2 horas', () => {
    expect(splitCheckoutWindowMinutes(7200)).toEqual({ amount: 5, unit: 'days' })
    expect(splitCheckoutWindowMinutes(120)).toEqual({ amount: 2, unit: 'hours' })
    expect(splitCheckoutWindowMinutes(45)).toEqual({ amount: 45, unit: 'minutes' })
  })

  it('el piso de 5 minutos de gracia no se puede expresar como 0 horas', () => {
    const hours = checkoutWindowLimitsInUnit({ min: 5, max: 1440 }, 'hours')
    expect(hours.min).toBe(1)
    expect(hours.max).toBe(24)
    expect(isCheckoutWindowDraftValid(1, 'minutes', { min: 5, max: 1440 })).toBe(false)
    expect(isCheckoutWindowDraftValid(1, 'hours', { min: 5, max: 1440 })).toBe(true)
  })
})
