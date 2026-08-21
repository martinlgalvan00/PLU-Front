import { describe, expect, it } from 'vitest'
import {
  buildOfferResumeOrder,
  getOfferState,
  isOfferUnlockKind,
  pickPrimaryOffer,
  previewUnlocksOffer,
  resolveOfferPricing,
} from '../src/services/exclusiveOfferService.js'

/** El caso real: ONLY-PITBULL, afiliación + inscripción a $120.000. */
function buildOffer(overrides = {}) {
  return {
    code: 'ONLY-PITBULL',
    kind: 'offer',
    appliesTo: 'combo',
    fixedPrice: 120000,
    fixedPriceManual: null,
    redeemed: false,
    startsAt: null,
    expiresAt: null,
    active: true,
    event: {
      slug: 'pitbull-classic',
      title: 'Pitbull Classic',
      registrationPrice: 65000,
      registrationManualPrice: null,
      currency: 'ARS',
    },
    comboOffer: {
      price: 150000,
      manualPrice: null,
      currency: 'ARS',
      active: true,
      audience: 'code',
      startsAt: null,
      endsAt: null,
    },
    membershipPlan: {
      code: 'plu-annual',
      name: 'Afiliación anual',
      price: 85000,
      manualPrice: null,
      currency: 'ARS',
    },
    ...overrides,
  }
}

describe('resolveOfferPricing', () => {
  it('desglosa las partes y el ahorro contra la suma', () => {
    const pricing = resolveOfferPricing(buildOffer())
    expect(pricing.membershipPrice).toBe(85000)
    expect(pricing.registrationPrice).toBe(65000)
    expect(pricing.listTotal).toBe(150000)
    expect(pricing.offerPrice).toBe(120000)
    expect(pricing.savings).toBe(30000)
    expect(pricing.currency).toBe('ARS')
  })

  it('usa el precio manual de la oferta cuando el canal es transferencia', () => {
    const pricing = resolveOfferPricing(buildOffer({ fixedPriceManual: 110000 }), {
      paymentMethod: 'transferencia',
    })
    expect(pricing.offerPrice).toBe(110000)
  })

  it('cotiza las partes por el canal manual cuando el catálogo lo declara', () => {
    const offer = buildOffer({
      fixedPriceManual: 110000,
      event: { ...buildOffer().event, registrationManualPrice: 60000 },
      membershipPlan: { ...buildOffer().membershipPlan, manualPrice: 80000 },
    })
    const pricing = resolveOfferPricing(offer, { paymentMethod: 'cash_pitbull' })
    expect(pricing.membershipPrice).toBe(80000)
    expect(pricing.registrationPrice).toBe(60000)
    expect(pricing.listTotal).toBe(140000)
    expect(pricing.offerPrice).toBe(110000)
    expect(pricing.savings).toBe(30000)
  })

  // Un 'access' no trae importe propio: la oferta es el precio del combo.
  it('un access hereda el precio del combo del evento', () => {
    const pricing = resolveOfferPricing(
      buildOffer({ kind: 'access', fixedPrice: null, comboOffer: { price: 120000, active: true } }),
    )
    expect(pricing.offerPrice).toBe(120000)
    expect(pricing.savings).toBe(30000)
  })

  it('nunca anuncia un ahorro negativo', () => {
    const pricing = resolveOfferPricing(buildOffer({ fixedPrice: 200000 }))
    expect(pricing.savings).toBe(0)
  })

  it('no explota sin oferta', () => {
    const pricing = resolveOfferPricing(null)
    expect(pricing.offerPrice).toBe(0)
    expect(pricing.savings).toBe(0)
  })
})

describe('getOfferState', () => {
  const now = new Date('2026-09-02T12:00:00Z')

  it('una oferta vigente con combo activo se puede comprar', () => {
    expect(getOfferState(buildOffer(), { now })).toEqual({ available: true, reason: null })
  })

  // Ya comprada Y pagada: la ficha pasa a ser el registro de lo que canjeó.
  it('una oferta ya comprada deja de ofrecer la acción', () => {
    expect(getOfferState(buildOffer({ redeemed: true }), { now })).toMatchObject({
      available: false,
      reason: 'redeemed',
    })
  })

  // `redeemed` se escribe al CREAR la orden: sin mirar su estado, la ficha
  // declaraba "ya compraste" a quien todavía no había pagado nada.
  it('una compra iniciada y sin pagar se puede retomar', () => {
    const state = getOfferState(
      buildOffer({
        redeemed: true,
        purchase: {
          orderId: 'ord-1',
          status: 'pendiente',
          amount: 120000,
          method: 'mercado_pago',
        },
      }),
      { now },
    )
    expect(state).toMatchObject({ available: false, resumable: true, reason: 'pending_payment' })
    expect(state.purchase.embeddable).toBe(true)
  })

  it('una compra por transferencia no se cobra con el brick', () => {
    const state = getOfferState(
      buildOffer({
        redeemed: true,
        purchase: {
          orderId: 'ord-2',
          status: 'validacion_manual',
          amount: 120000,
          method: 'manual_link',
        },
      }),
      { now },
    )
    expect(state.resumable).toBe(true)
    expect(state.purchase.embeddable).toBe(false)
    expect(buildOfferResumeOrder({ ...buildOffer(), purchase: state.purchase })).toBe(null)
  })

  it('respeta la ventana del código', () => {
    expect(getOfferState(buildOffer({ expiresAt: '2026-09-01T00:00:00Z' }), { now }).reason).toBe(
      'expired',
    )
    expect(getOfferState(buildOffer({ startsAt: '2026-09-03T00:00:00Z' }), { now }).reason).toBe(
      'not_started',
    )
  })

  it('respeta la ventana y el estado del combo', () => {
    expect(
      getOfferState(buildOffer({ comboOffer: { ...buildOffer().comboOffer, active: false } }), {
        now,
      }).reason,
    ).toBe('offer_unavailable')
    expect(
      getOfferState(
        buildOffer({ comboOffer: { ...buildOffer().comboOffer, endsAt: '2026-09-01T00:00:00Z' } }),
        { now },
      ).reason,
    ).toBe('offer_unavailable')
  })

  it('sin combo cargado no hay nada que comprar', () => {
    expect(getOfferState(buildOffer({ comboOffer: null }), { now }).reason).toBe(
      'offer_unavailable',
    )
  })

  it('sin evento tampoco', () => {
    expect(getOfferState(buildOffer({ event: null }), { now }).reason).toBe('offer_unavailable')
  })

  it('sin oferta devuelve missing', () => {
    expect(getOfferState(null).reason).toBe('missing')
  })
})

describe('pickPrimaryOffer', () => {
  const now = new Date('2026-09-02T12:00:00Z')

  it('elige la comprable antes que la canjeada', () => {
    const redeemed = buildOffer({ code: 'VIEJA', redeemed: true })
    const live = buildOffer({ code: 'ONLY-PITBULL' })
    expect(pickPrimaryOffer([redeemed, live], { now }).code).toBe('ONLY-PITBULL')
  })

  // Si no queda ninguna comprable, la ficha no puede aparecer vacía después de
  // haber anunciado un canje.
  it('cae a la primera si ninguna es comprable', () => {
    const redeemed = buildOffer({ code: 'VIEJA', redeemed: true })
    expect(pickPrimaryOffer([redeemed], { now }).code).toBe('VIEJA')
  })

  it('sin ofertas devuelve null', () => {
    expect(pickPrimaryOffer([])).toBe(null)
    expect(pickPrimaryOffer()).toBe(null)
  })
})

describe('previewUnlocksOffer / isOfferUnlockKind', () => {
  it('sólo un preview válido de access u offer desbloquea', () => {
    expect(previewUnlocksOffer({ valid: true, kind: 'offer' })).toBe(true)
    expect(previewUnlocksOffer({ valid: true, kind: 'access' })).toBe(true)
    expect(previewUnlocksOffer({ valid: true, kind: 'fixed_price' })).toBe(false)
    expect(previewUnlocksOffer({ valid: false, kind: 'offer' })).toBe(false)
    expect(previewUnlocksOffer(null)).toBe(false)
  })

  it('el espejo del backend no se desincroniza', () => {
    expect(isOfferUnlockKind('offer')).toBe(true)
    expect(isOfferUnlockKind('percent')).toBe(false)
  })
})
