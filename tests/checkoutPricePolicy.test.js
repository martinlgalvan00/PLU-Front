import { describe, expect, it } from 'vitest'
import { checkoutPriceFor } from '../server/modules/pricing/checkoutPricePolicy.js'
import { previewCheckoutPrice } from '../src/services/checkoutPricing.js'

const NOW = new Date('2026-08-20T15:00:00.000Z')

describe('política de precios de preventa Pitbull', () => {
  it.each([
    ['membership', 'mercado_pago', 85000],
    ['registration', 'mercado_pago', 85000],
    ['combo', 'mercado_pago', 170000],
    ['membership', 'manual_link', 75000],
    ['registration', 'manual_link', 75000],
    ['registration', 'cash_pitbull', 75000],
    ['membership', 'cash_pitbull', 75000],
    ['combo', 'manual_link', 120000],
    ['combo', 'cash_pitbull', 120000],
  ])('%s con %s cotiza ARS %i', (concept, paymentMethod, amount) => {
    expect(checkoutPriceFor({ concept, paymentMethod, now: NOW })).toBe(amount)
    expect(previewCheckoutPrice({ concept, paymentMethod, fallback: 1, now: NOW })).toBe(amount)
  })

  it('vence el beneficio después del viernes 28/08', () => {
    const afterDeadline = new Date('2026-08-29T03:00:00.000Z')
    expect(checkoutPriceFor({ concept: 'combo', paymentMethod: 'manual_link', now: afterDeadline })).toBeNull()
    expect(previewCheckoutPrice({ concept: 'combo', paymentMethod: 'manual_link', fallback: 170000, now: afterDeadline })).toBe(170000)
  })
})
