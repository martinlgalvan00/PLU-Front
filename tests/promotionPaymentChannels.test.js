import { describe, expect, it } from 'vitest'
import {
  promotionCodeAllowsChannel,
  promotionRedemptionChannelPolicy,
  resolvePromotionChannelSwitch,
  resolvePromotionPaymentChannels,
} from '../shared/promotionPaymentChannels.js'

describe('medios de pago de un codigo de promocion', () => {
  it('sin codigo conserva la configuracion global', () => {
    expect(
      resolvePromotionPaymentChannels({
        mercadoPagoOpen: true,
        bankTransferOpen: true,
        cashPitbullOpen: true,
        wiseTransferOpen: true,
      }),
    ).toEqual({
      mercadoPago: true,
      bankTransfer: true,
      cashPitbull: true,
      wiseTransfer: true,
      restrictedByCode: false,
    })
  })

  it('un codigo solo Mercado Pago cierra efectivo, transferencia y Wise', () => {
    const policy = {
      valid: true,
      manualChannels: [],
      mercadoPagoEnabled: true,
    }

    expect(
      resolvePromotionPaymentChannels({
        policy,
        mercadoPagoOpen: true,
        bankTransferOpen: true,
        cashPitbullOpen: true,
        wiseTransferOpen: true,
      }),
    ).toEqual({
      mercadoPago: true,
      bankTransfer: false,
      cashPitbull: false,
      wiseTransfer: false,
      restrictedByCode: true,
    })
  })

  it('solo permite cada canal manual declarado por el codigo', () => {
    const policy = {
      found: true,
      manualChannels: ['bank_transfer'],
      mercadoPagoEnabled: false,
    }

    expect(promotionCodeAllowsChannel(policy, 'bank_transfer')).toBe(true)
    expect(promotionCodeAllowsChannel(policy, 'cash_pitbull')).toBe(false)
    expect(promotionCodeAllowsChannel(policy, 'mercado_pago')).toBe(false)
    expect(promotionCodeAllowsChannel(policy, 'wise_transfer')).toBe(false)
  })

  it('un codigo no reabre Mercado Pago si la pasarela esta cerrada globalmente', () => {
    expect(
      resolvePromotionPaymentChannels({
        policy: { valid: true, manualChannels: [], mercadoPagoEnabled: true },
        mercadoPagoOpen: false,
        bankTransferOpen: true,
        cashPitbullOpen: true,
      }),
    ).toMatchObject({ mercadoPago: false, bankTransfer: false, cashPitbull: false })
  })
})

describe('politica de canales de un canje aceptado', () => {
  it('lee la matriz que viaja en el benefit', () => {
    expect(
      promotionRedemptionChannelPolicy({
        accepted: true,
        benefit: { manualChannels: ['bank_transfer'], mercadoPagoEnabled: false },
      }),
    ).toEqual({ found: true, manualChannels: ['bank_transfer'], mercadoPagoEnabled: false })
  })

  it('sin matriz no hay politica: un resolvedor viejo no decide nada', () => {
    expect(promotionRedemptionChannelPolicy({ accepted: true, benefit: { percentOff: 10 } })).toBe(
      null,
    )
    expect(promotionRedemptionChannelPolicy({ accepted: true, benefit: null })).toBe(null)
    expect(promotionRedemptionChannelPolicy(null)).toBe(null)
  })

  it('un canje rechazado no trae politica', () => {
    expect(
      promotionRedemptionChannelPolicy({
        accepted: false,
        benefit: { manualChannels: ['cash_pitbull'] },
      }),
    ).toBe(null)
  })
})

describe('salto de canal al canjear un codigo', () => {
  const soloMercadoPago = { found: true, manualChannels: [], mercadoPagoEnabled: true }
  const soloTransferencia = {
    found: true,
    manualChannels: ['bank_transfer'],
    mercadoPagoEnabled: false,
  }

  it('un codigo solo Mercado Pago canjeado con transferencia elegida salta a la pasarela', () => {
    expect(
      resolvePromotionChannelSwitch(soloMercadoPago, {
        current: 'bank_transfer',
        mercadoPagoOpen: true,
      }),
    ).toBe('mercado_pago')
  })

  it('un codigo solo transferencia canjeado con Mercado Pago elegido salta a transferencia', () => {
    expect(
      resolvePromotionChannelSwitch(soloTransferencia, {
        current: 'mercado_pago',
        mercadoPagoOpen: true,
      }),
    ).toBe('bank_transfer')
  })

  it('no toca la seleccion cuando el canal elegido sobrevive al codigo', () => {
    expect(
      resolvePromotionChannelSwitch(soloTransferencia, {
        current: 'bank_transfer',
        mercadoPagoOpen: true,
      }),
    ).toBe(null)
  })

  it('sin politica no hay salto: el cupon abierto respeta lo elegido', () => {
    expect(resolvePromotionChannelSwitch(null, { current: 'bank_transfer' })).toBe(null)
  })

  it('no salta a una pasarela cerrada globalmente: el rechazo lo explica el preview', () => {
    expect(
      resolvePromotionChannelSwitch(soloMercadoPago, {
        current: 'bank_transfer',
        mercadoPagoOpen: false,
      }),
    ).toBe(null)
  })

  it('Wise nunca sobrevive a un codigo: salta al primer canal que el codigo admite', () => {
    expect(
      resolvePromotionChannelSwitch(soloMercadoPago, {
        current: 'wise_transfer',
        mercadoPagoOpen: true,
      }),
    ).toBe('mercado_pago')
  })

  it('prefiere la pasarela y despues los manuales, en el orden del checkout', () => {
    const abierto = {
      found: true,
      manualChannels: ['cash_pitbull', 'bank_transfer'],
      mercadoPagoEnabled: true,
    }
    expect(
      resolvePromotionChannelSwitch(abierto, { current: 'wise_transfer', mercadoPagoOpen: true }),
    ).toBe('mercado_pago')
    expect(
      resolvePromotionChannelSwitch(abierto, { current: 'wise_transfer', mercadoPagoOpen: false }),
    ).toBe('bank_transfer')
  })
})
