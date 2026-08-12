import { describe, expect, it } from 'vitest'
import {
  assertComboCheckoutAvailable,
  assertRecurringMembershipAvailable,
  filterPublicMembershipPlans,
} from '../server/lib/featureAvailability.js'
import { getEventComboAvailability } from '../src/services/comboOfferService.js'
import { filterMembershipPlansForApp } from '../src/services/paymentService.js'

const PLANS = [
  { code: 'plu-annual', collection_mode: 'one_time', collectionMode: 'one_time' },
  { code: 'plu-annual-auto', collection_mode: 'recurring', collectionMode: 'recurring' },
]

describe('features disponibles por entorno', () => {
  it('oculta planes recurrentes en frontend y backend cuando APP_PRODUCTION esta activo', () => {
    expect(filterPublicMembershipPlans(PLANS, { APP_PRODUCTION: 'true' })).toHaveLength(1)
    expect(filterMembershipPlansForApp(PLANS, { appProduction: true })).toHaveLength(1)
    expect(filterPublicMembershipPlans(PLANS, { APP_PRODUCTION: 'false' })).toHaveLength(2)
    expect(filterMembershipPlansForApp(PLANS, { appProduction: false })).toHaveLength(2)
  })

  it('permite el combo en produccion y sigue bloqueando el debito automatico', () => {
    expect(() => assertComboCheckoutAvailable({ APP_PRODUCTION: 'true' })).not.toThrow()
    expect(() => assertComboCheckoutAvailable({ APP_PRODUCTION: 'false' })).not.toThrow()
    expect(() => assertRecurringMembershipAvailable({ APP_PRODUCTION: 'true' })).toThrowError(
      expect.objectContaining({
        status: 409,
        details: { code: 'FEATURE_COMING_SOON' },
      }),
    )
    expect(() => assertRecurringMembershipAvailable({ APP_PRODUCTION: 'false' })).not.toThrow()
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
      offer: { price: 120000 },
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
