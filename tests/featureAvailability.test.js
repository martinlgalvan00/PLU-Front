import { describe, expect, it } from 'vitest'
import {
  FEATURE_KEYS,
  assertComboCheckoutAvailable,
  assertPricingWritesEnabled,
  assertRecurringMembershipAvailable,
  filterPublicMembershipPlans,
  getFeatureAvailability,
  isFeatureEnabled,
} from '../server/lib/featureAvailability.js'
import {
  FEATURE_KEYS as FRONT_FEATURE_KEYS,
  filterPublicMembershipPlans as filterFrontPlans,
  getFeatureAvailability as getFrontFeatureAvailability,
  isFeatureEnabled as isFrontFeatureEnabled,
} from '../src/lib/featureAvailability.js'
import { getEventComboAvailability } from '../src/services/comboOfferService.js'
import { filterMembershipPlansForApp } from '../src/services/paymentService.js'

const PLANS = [
  { code: 'plu-annual', collection_mode: 'one_time', collectionMode: 'one_time' },
  { code: 'plu-annual-auto', collection_mode: 'recurring', collectionMode: 'recurring' },
]

describe('features disponibles por entorno', () => {
  it('expone el mismo catalogo de keys en front y back', () => {
    expect(FRONT_FEATURE_KEYS).toEqual(FEATURE_KEYS)
  })

  it('oculta planes recurrentes en frontend y backend cuando APP_PRODUCTION esta activo', () => {
    expect(filterPublicMembershipPlans(PLANS, { APP_PRODUCTION: 'true' })).toHaveLength(1)
    expect(filterFrontPlans(PLANS, { appProduction: true })).toHaveLength(1)
    expect(filterMembershipPlansForApp(PLANS, { appProduction: true })).toHaveLength(1)
    expect(filterPublicMembershipPlans(PLANS, { APP_PRODUCTION: 'false' })).toHaveLength(2)
    expect(filterMembershipPlansForApp(PLANS, { appProduction: false })).toHaveLength(2)
  })

  it('alinea isFeatureEnabled / getFeatureAvailability entre front y back', () => {
    const prod = { APP_PRODUCTION: 'true' }
    const local = { APP_PRODUCTION: 'false' }

    expect(isFeatureEnabled(FEATURE_KEYS.recurringMembership, prod)).toBe(false)
    expect(isFrontFeatureEnabled(FEATURE_KEYS.recurringMembership, { appProduction: true })).toBe(false)
    expect(isFeatureEnabled(FEATURE_KEYS.pricingWrites, prod)).toBe(false)
    expect(isFrontFeatureEnabled(FEATURE_KEYS.pricingWrites, { appProduction: true })).toBe(false)
    expect(isFeatureEnabled(FEATURE_KEYS.comboCheckout, prod)).toBe(true)
    expect(isFrontFeatureEnabled(FEATURE_KEYS.comboCheckout, { appProduction: true })).toBe(true)

    expect(getFeatureAvailability(FEATURE_KEYS.pricingWrites, prod)).toEqual({
      enabled: false,
      reason: 'production_coming_soon',
    })
    expect(getFrontFeatureAvailability(FEATURE_KEYS.pricingWrites, { appProduction: true })).toEqual({
      enabled: false,
      reason: 'production_coming_soon',
    })
    expect(getFeatureAvailability(FEATURE_KEYS.pricingWrites, local)).toEqual({
      enabled: true,
      reason: null,
    })
  })

  it('permite el combo en produccion y sigue bloqueando el debito automatico y pricing writes', () => {
    expect(() => assertComboCheckoutAvailable({ APP_PRODUCTION: 'true' })).not.toThrow()
    expect(() => assertComboCheckoutAvailable({ APP_PRODUCTION: 'false' })).not.toThrow()
    expect(() => assertRecurringMembershipAvailable({ APP_PRODUCTION: 'true' })).toThrowError(
      expect.objectContaining({
        status: 409,
        details: { code: 'FEATURE_COMING_SOON' },
      }),
    )
    expect(() => assertRecurringMembershipAvailable({ APP_PRODUCTION: 'false' })).not.toThrow()
    expect(() => assertPricingWritesEnabled({ APP_PRODUCTION: 'true' })).toThrowError(
      expect.objectContaining({
        status: 409,
        details: { code: 'FEATURE_COMING_SOON' },
      }),
    )
    expect(() => assertPricingWritesEnabled({ APP_PRODUCTION: 'false' })).not.toThrow()
  })

  it('habilita el combo operativo cuando la oferta esta vigente', () => {
    const event = {
      comboOffer: {
        id: 'offer-1',
        active: true,
        price: 120000,
        startsAt: '2026-08-01T00:00:00Z',
        endsAt: '2026-08-28T23:59:59-03:00',
      },
    }
    const now = new Date('2026-08-12T12:00:00Z')

    expect(getEventComboAvailability(event, { now })).toMatchObject({
      enabled: true,
      comingSoon: false,
    })
    expect(getEventComboAvailability(event, {
      hasActiveMembership: true,
      now,
    })).toMatchObject({ enabled: false, comingSoon: false })
    expect(getEventComboAvailability(event, {
      now: new Date('2026-08-29T03:00:00Z'),
    })).toMatchObject({ enabled: false, comingSoon: false, offer: null })
    expect(getEventComboAvailability({
      comboOffer: { id: 'offer-incomplete', price: 120000 },
    }, { now })).toMatchObject({ enabled: false, offer: null })
  })
})
