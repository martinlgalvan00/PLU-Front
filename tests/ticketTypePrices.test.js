import { describe, expect, it } from 'vitest'
import {
  catalogPriceFromRow,
  normalizeTicketTypePrices,
  optionalTicketChannelPrice,
  paidAddonsMissingWise,
} from '../src/lib/ticketTypePrices.js'

describe('optionalTicketChannelPrice', () => {
  it('vacío, 0 o basura quedan en null', () => {
    expect(optionalTicketChannelPrice('')).toBeNull()
    expect(optionalTicketChannelPrice(null)).toBeNull()
    expect(optionalTicketChannelPrice(0)).toBeNull()
    expect(optionalTicketChannelPrice('no')).toBeNull()
  })

  it('entera un monto cobrable', () => {
    expect(optionalTicketChannelPrice('15')).toBe(15)
    expect(optionalTicketChannelPrice(17000.9)).toBe(17000)
  })
})

describe('catalogPriceFromRow', () => {
  it('acepta snake_case y camelCase', () => {
    expect(catalogPriceFromRow({ wise_price: 15 }, 'wise_price', 'wisePrice')).toBe(15)
    expect(catalogPriceFromRow({ wisePrice: 15 }, 'wise_price', 'wisePrice')).toBe(15)
  })
})

describe('normalizeTicketTypePrices', () => {
  it('manda string vacío a null para no pisar el upsert con un no-precio', () => {
    expect(normalizeTicketTypePrices({ wisePrice: '', manualPrice: '' })).toEqual({
      wisePrice: null,
      manualPrice: null,
    })
  })
})

describe('paidAddonsMissingWise', () => {
  it('lista beneficios pagos habilitados sin USD propio', () => {
    const missing = paidAddonsMissingWise([
      { id: 'chori', label: 'Choripán', price: 5000, wisePrice: null, enabled: true },
      { id: 'agua', label: 'Agua', price: 2000, wisePrice: 2, enabled: true },
      { id: 'off', label: 'Off', price: 3000, wisePrice: null, enabled: false },
    ])
    expect(missing.map((addon) => addon.id)).toEqual(['chori'])
  })
})
