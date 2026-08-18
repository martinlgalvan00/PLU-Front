import { describe, expect, it } from 'vitest'
import {
  FEATURE_KEYS,
  assertComboCheckoutAvailable,
  assertPaidCheckoutAvailable,
  assertPricingWritesEnabled,
  assertRecurringMembershipAvailable,
  filterPublicMembershipPlans,
  getFeatureAvailability,
  isFeatureEnabled,
  isPaidCheckoutEnabled,
} from '../server/lib/featureAvailability.js'
import {
  FEATURE_KEYS as FRONT_FEATURE_KEYS,
  filterPublicMembershipPlans as filterFrontPlans,
  getFeatureAvailability as getFrontFeatureAvailability,
  isFeatureEnabled as isFrontFeatureEnabled,
  isPaidCheckoutEnabled as isFrontPaidCheckoutEnabled,
} from '../src/lib/featureAvailability.js'
import { filterMembershipPlansForApp } from '../src/services/paymentService.js'

const PLANS = [
  { code: 'plu-annual', collection_mode: 'one_time', collectionMode: 'one_time' },
  { code: 'plu-annual-auto', collection_mode: 'recurring', collectionMode: 'recurring' },
]

describe('disponibilidad pública de funcionalidades', () => {
  it('alinea el catálogo entre frontend y backend', () => {
    expect(FRONT_FEATURE_KEYS).toEqual(FEATURE_KEYS)
  })

  it('publica todos los planes sin depender del entorno', () => {
    expect(filterPublicMembershipPlans(PLANS)).toHaveLength(2)
    expect(filterFrontPlans(PLANS)).toHaveLength(2)
    expect(filterMembershipPlansForApp(PLANS)).toHaveLength(2)
  })

  it('abre recurring y tarifas por defecto, y deja pagos abiertos salvo pausa explícita', () => {
    expect(isFeatureEnabled(FEATURE_KEYS.recurringMembership)).toBe(true)
    expect(isFeatureEnabled(FEATURE_KEYS.pricingWrites)).toBe(true)
    expect(isPaidCheckoutEnabled({})).toBe(true)
    expect(isFrontPaidCheckoutEnabled({})).toBe(true)
    expect(isFeatureEnabled(FEATURE_KEYS.paidCheckout, { PAID_CHECKOUT_ENABLED: 'false' })).toBe(
      false,
    )
    expect(isFrontFeatureEnabled(FEATURE_KEYS.comboCheckout, { paidCheckoutEnabled: false })).toBe(
      false,
    )
    expect(
      getFeatureAvailability(FEATURE_KEYS.paidCheckout, { PAID_CHECKOUT_ENABLED: 'false' }),
    ).toEqual({
      enabled: false,
      reason: 'checkout_paused',
    })
    expect(getFrontFeatureAvailability(FEATURE_KEYS.pricingWrites)).toEqual({
      enabled: true,
      reason: null,
    })
  })

  it('solo bloquea pagos cuando se activa el kill switch', async () => {
    await expect(assertPaidCheckoutAvailable()).resolves.toBeUndefined()
    await expect(assertComboCheckoutAvailable()).resolves.toBeUndefined()
    await expect(
      assertPaidCheckoutAvailable({ PAID_CHECKOUT_ENABLED: 'false' }),
    ).rejects.toMatchObject({ status: 409 })
    expect(() => assertRecurringMembershipAvailable()).not.toThrow()
    expect(() => assertPricingWritesEnabled()).not.toThrow()
  })
})
