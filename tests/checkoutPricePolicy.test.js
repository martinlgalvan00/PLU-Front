import { describe, expect, it } from 'vitest'
import { previewCheckoutPrice, toApiPaymentMethod } from '../src/services/checkoutPricing.js'

describe('previewCheckoutPrice', () => {
  it.each(['manual_link', 'transferencia', 'cash_pitbull'])(
    'cotiza el precio manual del plan/evento/combo para %s cuando está configurado',
    (paymentMethod) => {
      expect(previewCheckoutPrice({ paymentMethod, manualPrice: 75000, fallback: 85000 })).toBe(
        75000,
      )
    },
  )

  it('cotiza el precio de catálogo por Mercado Pago, tenga o no precio manual configurado', () => {
    expect(
      previewCheckoutPrice({ paymentMethod: 'mercado_pago', manualPrice: 75000, fallback: 85000 }),
    ).toBe(85000)
  })

  it('cotiza el precio de catálogo por canal manual cuando no hay precio manual configurado', () => {
    expect(
      previewCheckoutPrice({ paymentMethod: 'manual_link', manualPrice: null, fallback: 85000 }),
    ).toBe(85000)
    expect(
      previewCheckoutPrice({
        paymentMethod: 'cash_pitbull',
        manualPrice: undefined,
        fallback: 85000,
      }),
    ).toBe(85000)
  })
})

describe('normalización del canal de pago hacia la API', () => {
  it('traduce el nombre que usa la UI al que entiende el backend', () => {
    expect(toApiPaymentMethod('transferencia')).toBe('manual_link')
    expect(toApiPaymentMethod('manual_link')).toBe('manual_link')
    expect(toApiPaymentMethod('cash_pitbull')).toBe('cash_pitbull')
    expect(toApiPaymentMethod('mercado_pago')).toBe('mercado_pago')
  })

  it('no inventa un canal cuando no hay ninguno elegido', () => {
    expect(toApiPaymentMethod(undefined)).toBeNull()
    expect(toApiPaymentMethod('bitcoin')).toBeNull()
  })
})
