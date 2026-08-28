import { describe, expect, it } from 'vitest'
import { discountCodeSchema } from '../server/routes/pricing.js'
import { isBundleOffer } from '../src/services/athleteApi.js'
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
    // La ficha de Mi cuenta volvió para el código-paquete (20260926100000),
    // así que "no está el tab" dejó de ser la prueba. La prueba ahora es el
    // filtro que la alimenta: una fila histórica `offer`/`access` no llega
    // nunca a renderizarse, aunque el servidor la devuelva.
    expect(isBundleOffer({ kind: 'offer', appliesTo: 'combo' })).toBe(false)
    expect(isBundleOffer({ kind: 'access', appliesTo: 'combo' })).toBe(false)
    expect(isBundleOffer({ kind: 'fixed_price', appliesTo: 'membership' })).toBe(false)
    expect(isBundleOffer({ kind: 'fixed_price', appliesTo: 'combo' })).toBe(true)
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
