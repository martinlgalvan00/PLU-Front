import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildPromotionCodeUrl,
  clearPendingPromotionCode,
  matchPromotionCodeRoute,
  promotionDestination,
  promotionBenefitPresentation,
  promotionDestinationType,
  readPendingPromotionCode,
  redeemPromotionCode,
  savePendingPromotionCode,
} from '../src/services/promotionCodeService.js'

afterEach(() => {
  clearPendingPromotionCode()
})

describe('servicio universal de códigos', () => {
  it('normaliza el enlace directo y reconoce su ruta', () => {
    expect(buildPromotionCodeUrl(' only-pitbull ', 'https://plu.test/')).toBe(
      'https://plu.test/canjear/ONLY-PITBULL',
    )
    expect(matchPromotionCodeRoute('/canjear/only-pitbull')).toEqual({ code: 'ONLY-PITBULL' })
    expect(matchPromotionCodeRoute('/canjear/%E0%A4%A')).toBeNull()
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
})
