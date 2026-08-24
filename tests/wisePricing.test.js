import { describe, expect, it } from 'vitest'
import { arsToWiseUsd } from '../shared/wisePricing.js'
import { wisePriceFor } from '../server/modules/pricing/checkoutPricePolicy.js'

describe('wise pricing', () => {
  const env = {
    WISE_BLUE_RATE_ARS: '1550',
    WISE_ROUNDING_STEP_USD: '5',
  }

  it('convierte ARS a USD blue y redondea hacia arriba en saltos de 5', () => {
    expect(arsToWiseUsd(75000, env)).toBe(50)
    expect(arsToWiseUsd(120000, env)).toBe(80)
  })

  it('usa el precio ARS vigente cuando no hay override fijo por concepto', () => {
    expect(wisePriceFor({ concept: 'membership', arsAmount: 75000 }, env)).toEqual({
      amount: 50,
      currency: 'USD',
    })
  })

  it('mantiene el override fijo si se configura explicitamente', () => {
    expect(
      wisePriceFor(
        { concept: 'registration', arsAmount: 75000 },
        { ...env, WISE_PRICE_REGISTRATION_USD: '65' },
      ),
    ).toEqual({ amount: 65, currency: 'USD' })
  })
})
