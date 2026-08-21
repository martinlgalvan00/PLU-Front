import { describe, expect, it } from 'vitest'
import {
  buildOfferResumeOrder,
  checkoutMethodForChannel,
  getActionableOffers,
  getOfferState,
  isOfferUnlockKind,
  pickPrimaryOffer,
  previewUnlocksOffer,
  resolveManualSettlement,
  resolveOfferChannels,
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

  it('FIAR deja de sostener la ficha cuando ya otorgó ambos derechos', () => {
    const financed = buildOffer({
      redeemed: true,
      purchase: {
        orderId: 'ord-fiar',
        status: 'validacion_manual',
        amount: 120000,
        method: 'manual_link',
        financingAllowed: true,
        manualPaymentDeclaredAt: '2026-09-02T12:30:00Z',
        financedEntitlementsAt: '2026-09-02T12:30:00Z',
      },
    })

    const state = getOfferState(financed, { now })
    expect(state).toMatchObject({ available: false, reason: 'financed' })
    expect(state.resumable).toBeUndefined()
    expect(state.purchase.financed).toBe(true)
  })

  it('la aprobación final gana sobre el estado provisional de FIAR', () => {
    const approved = buildOffer({
      redeemed: true,
      purchase: {
        orderId: 'ord-fiar-paid',
        status: 'aprobado',
        amount: 120000,
        method: 'manual_link',
        financingAllowed: true,
        financedEntitlementsAt: '2026-09-02T12:30:00Z',
      },
    })

    expect(getOfferState(approved, { now })).toMatchObject({ reason: 'redeemed' })
  })

  it('una transferencia sin FIAR sigue visible hasta la revisión administrativa', () => {
    const awaitingReview = buildOffer({
      redeemed: true,
      purchase: {
        orderId: 'ord-manual',
        status: 'validacion_manual',
        amount: 120000,
        method: 'manual_link',
        financingAllowed: false,
        manualPaymentDeclaredAt: '2026-09-02T12:30:00Z',
      },
    })

    expect(getOfferState(awaitingReview, { now })).toMatchObject({
      resumable: true,
      reason: 'pending_payment',
    })
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

  it('una compra aprobada deja de sostener la ficha secreta', () => {
    const redeemed = buildOffer({ code: 'VIEJA', redeemed: true })
    expect(pickPrimaryOffer([redeemed], { now })).toBe(null)
    expect(getActionableOffers([redeemed], { now })).toEqual([])
  })

  it('una compra financiada deja de sostener la ficha secreta', () => {
    const financed = buildOffer({
      redeemed: true,
      purchase: {
        orderId: 'ord-fiar',
        status: 'validacion_manual',
        method: 'manual_link',
        financingAllowed: true,
        financedEntitlementsAt: '2026-09-02T12:30:00Z',
      },
    })
    expect(pickPrimaryOffer([financed], { now })).toBe(null)
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

describe('resolveOfferChannels', () => {
  it('sin declarar nada, la oferta va sólo por Mercado Pago', () => {
    // Es el comportamiento de todos los códigos anteriores a 20260908100000, y
    // el de cualquier payload que responda una API sin la migración aplicada.
    expect(resolveOfferChannels(buildOffer())).toEqual(['mercado_pago'])
  })

  it('suma los canales manuales que el código destraba, en orden de lectura', () => {
    expect(
      resolveOfferChannels(buildOffer({ manualChannels: ['cash_pitbull', 'bank_transfer'] })),
    ).toEqual(['mercado_pago', 'bank_transfer', 'cash_pitbull'])
  })

  it('un código que cierra la pasarela deja sólo lo que habilita', () => {
    expect(
      resolveOfferChannels(
        buildOffer({ mercadoPagoEnabled: false, manualChannels: ['cash_pitbull'] }),
      ),
    ).toEqual(['cash_pitbull'])
  })

  it('con un concepto cerrado no hay medio por el que cobrar', () => {
    // El combo acredita afiliación E inscripción: si Administración cerró
    // cualquiera de las dos, no alcanza con que el código habilite un canal.
    expect(
      resolveOfferChannels(buildOffer({ manualChannels: ['bank_transfer'] }), {
        conceptsOpen: false,
      }),
    ).toEqual([])
    expect(resolveOfferChannels(null)).toEqual([])
  })
})

describe('checkoutMethodForChannel', () => {
  it('traduce al nombre que espera la API', () => {
    expect(checkoutMethodForChannel('bank_transfer')).toBe('manual_link')
    expect(checkoutMethodForChannel('cash_pitbull')).toBe('cash_pitbull')
    expect(checkoutMethodForChannel('mercado_pago')).toBe('mercado_pago')
    // Sin canal (cobro cerrado) el default es la pasarela: es sólo el medio con
    // el que se cotiza en pantalla, no un alta.
    expect(checkoutMethodForChannel(null)).toBe('mercado_pago')
  })
})

describe('resolveManualSettlement', () => {
  const manualPurchase = {
    orderId: 'order-1',
    status: 'validacion_manual',
    amount: 110000,
    currency: 'ARS',
    method: 'manual_link',
    manualPaymentChannel: 'bank_transfer',
  }

  it('devuelve la orden manual abierta y su canal', () => {
    expect(resolveManualSettlement(buildOffer({ purchase: manualPurchase }))).toMatchObject({
      channel: 'bank_transfer',
      orderId: 'order-1',
      amount: 110000,
    })
  })

  it('una orden manual sin canal guardado es una transferencia', () => {
    const legacy = { ...manualPurchase, manualPaymentChannel: null }
    expect(resolveManualSettlement(buildOffer({ purchase: legacy })).channel).toBe('bank_transfer')
  })

  it('la orden recién creada gana sobre la del payload', () => {
    const created = {
      paymentId: 'order-nueva',
      amount: 95000,
      status: 'pendiente',
      paymentMethod: 'manual_link',
      manualPaymentChannel: 'cash_pitbull',
    }
    expect(
      resolveManualSettlement(buildOffer({ purchase: manualPurchase }), created),
    ).toMatchObject({ channel: 'cash_pitbull', orderId: 'order-nueva', amount: 95000 })
  })

  it('Mercado Pago no se liquida a mano: eso lo cobra el brick', () => {
    const mp = { ...manualPurchase, method: 'mercado_pago', manualPaymentChannel: null }
    expect(resolveManualSettlement(buildOffer({ purchase: mp }))).toBe(null)
  })

  it('una orden cerrada no ofrece liquidarse de nuevo', () => {
    const paid = { ...manualPurchase, status: 'aprobado' }
    expect(resolveManualSettlement(buildOffer({ purchase: paid }))).toBe(null)
    expect(resolveManualSettlement(buildOffer())).toBe(null)
  })
})
