import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearPendingPromotionCode,
  extractPromotionCodeFromScan,
  promotionDestination,
  promotionBenefitPresentation,
  promotionDestinationType,
  promotionPaymentPresentation,
  readPendingPromotionCode,
  redeemPromotionCode,
  savePendingPromotionCode,
} from '../src/services/promotionCodeService.js'

afterEach(() => {
  clearPendingPromotionCode()
})

describe('servicio universal de códigos', () => {
  it('lee del escaneo el código pelado, que es lo que codifica el QR', () => {
    // No hay página pública de canje: el QR de Precios lleva el código y se
    // escanea desde el campo de Afiliación o Inscripción.
    expect(extractPromotionCodeFromScan(' only-pitbull ')).toBe('ONLY-PITBULL')
    expect(extractPromotionCodeFromScan('no es un código')).toBeNull()
    expect(extractPromotionCodeFromScan('')).toBeNull()
  })

  it('todavía rescata los QR viejos que traían una URL', () => {
    // Se repartieron con `/canjear/:code` cuando esa ruta existía. Reconocer el
    // texto no da ningún privilegio: el canje lo resuelve el servidor igual.
    expect(extractPromotionCodeFromScan('https://plu.test/canjear/only-pitbull')).toBe(
      'ONLY-PITBULL',
    )
    expect(extractPromotionCodeFromScan('https://plu.test/canjear/%E0%A4%A')).toBeNull()
  })

  it('preserva código y contexto durante el login', () => {
    expect(
      savePendingPromotionCode('only-pitbull', {
        surface: 'direct',
        destination: { view: 'profile', tab: 'account-offer' },
      }),
    ).toBe(true)
    expect(readPendingPromotionCode()).toEqual(
      expect.objectContaining({
        code: 'ONLY-PITBULL',
        context: expect.objectContaining({ surface: 'direct' }),
      }),
    )
  })

  it('delega una vez al resolvedor y traduce la pestaña secreta', async () => {
    const redeem = vi.fn().mockResolvedValue({
      accepted: true,
      action: 'open_exclusive_offer',
      code: 'ONLY-PITBULL',
    })
    const result = await redeemPromotionCode('only-pitbull', { surface: 'membership' }, { redeem })

    expect(redeem).toHaveBeenCalledWith({
      code: 'ONLY-PITBULL',
      context: { surface: 'membership' },
    })
    expect(promotionDestination(result)).toEqual({
      view: 'profile',
      options: { tab: 'account-offer' },
    })
  })

  it('describe el beneficio y el checkout sin inferirlos desde el copy', () => {
    const result = {
      accepted: true,
      kind: 'percent',
      benefit: { percentOff: 15 },
      destination: { view: 'profile', tab: 'account-membership' },
    }

    expect(promotionBenefitPresentation(result)).toEqual({ type: 'percent', percent: 15 })
    expect(promotionDestinationType(result)).toBe('membership')
  })

  it('dice con qué se paga el código recién canjeado', () => {
    // El canje devolvía el beneficio y callaba el medio: el atleta descubría
    // que su código sólo se cobra en efectivo recién dentro del checkout.
    const soloEfectivo = promotionPaymentPresentation({
      accepted: true,
      kind: 'fixed_price',
      benefit: {
        fixedPrice: 90000,
        manualChannels: ['cash_pitbull'],
        mercadoPagoEnabled: false,
        financed: false,
      },
    })

    expect(soloEfectivo).toEqual({
      channels: ['cash_pitbull'],
      financed: false,
      gatewayClosed: true,
    })
  })

  it('anuncia el pago delegable sólo sobre un canal que se cobra a mano', () => {
    const financiado = promotionPaymentPresentation({
      accepted: true,
      kind: 'offer',
      benefit: {
        manualChannels: ['bank_transfer', 'cash_pitbull'],
        mercadoPagoEnabled: true,
        financed: true,
      },
    })
    expect(financiado).toEqual({
      channels: ['mercado_pago', 'bank_transfer', 'cash_pitbull'],
      financed: true,
      gatewayClosed: false,
    })

    // Financiado sin canal manual es el interruptor inerte que la migración
    // 20260912100000 prohíbe: si igual llegara desde un código viejo, la UI no
    // promete una delegación que el checkout no va a poder ofrecer.
    expect(
      promotionPaymentPresentation({
        accepted: true,
        benefit: { manualChannels: [], mercadoPagoEnabled: true, financed: true },
      }),
    ).toEqual({ channels: ['mercado_pago'], financed: false, gatewayClosed: false })
  })

  it('no dice nada del cobro cuando el canje fue rechazado', () => {
    expect(promotionPaymentPresentation({ accepted: false, reason: 'expired' })).toBeNull()
  })
})
