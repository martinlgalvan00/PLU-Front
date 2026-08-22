import { describe, expect, it } from 'vitest'
import { discountCodeSchema } from '../server/routes/pricing.js'
import { ACCOUNT_TAB_IDS } from '../src/lib/navigation.js'
import { mapPricingConfiguration } from '../src/services/pricingAdminService.js'
import { redeemPromotionCode } from '../src/services/promotionCodeService.js'

const baseCode = {
  code: 'DESCUENTO-2026',
  appliesTo: 'membership',
  percentOff: 10,
}

describe('ofertas exclusivas por código retiradas', () => {
  it('rechaza su creación desde el contrato HTTP', () => {
    expect(discountCodeSchema.safeParse({ ...baseCode, kind: 'offer' }).success).toBe(false)
    expect(discountCodeSchema.safeParse({ ...baseCode, kind: 'access' }).success).toBe(false)
  })

  it('no muestra filas históricas en el catálogo de Tarifas ni en Mi cuenta', () => {
    expect(
      mapPricingConfiguration({
        discountCodes: [
          { id: 'old', code: 'SECRETO', kind: 'offer' },
          { id: 'live', code: 'AHORRO', kind: 'percent', percent_off: 10 },
        ],
      }).discountCodes.map((code) => code.code),
    ).toEqual(['AHORRO'])
    expect(ACCOUNT_TAB_IDS).not.toContain('account-offer')
  })

  it('bloquea la respuesta de un backend todavía no migrado antes de navegar', async () => {
    const result = await redeemPromotionCode('SECRETO', {}, {
      redeem: async () => ({
        accepted: true,
        kind: 'offer',
        action: 'open_exclusive_offer',
      }),
    })
    expect(result).toMatchObject({ accepted: false, status: 'rejected', reason: 'offer_unavailable' })
  })
})
