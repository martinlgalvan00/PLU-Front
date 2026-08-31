import { describe, expect, it } from 'vitest'
import {
  promotionCodeAllowsChannel,
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
