import { describe, expect, it } from 'vitest'
import {
  configuredTicketWiseUsd,
  resolveTicketOrderWisePricing,
} from '../shared/ticketWisePricing.js'

/**
 * El número que ve el comprador antes de elegir Wise y el que la API guarda en
 * la orden salen de esta función. Si divergen, el comprador transfiere un monto
 * y Finanzas espera otro, así que lo que importa acá es que la regla de
 * "todo cargado o nada" no tenga grises.
 */

// Dólar y salto de redondeo fijos: la conversión de respaldo no puede depender
// del entorno de quien corre los tests.
const ENV = { WISE_BLUE_RATE_ARS: '1000', WISE_ROUNDING_STEP_USD: '5' }

const GENERAL = { id: 'general', name: 'General', price: 20000, wisePrice: 15 }
const COACH = { id: 'coach', name: 'Entrenador', price: 40000, wisePrice: 30 }
const CHORI = { id: 'chori', label: 'Choripán', price: 5000, wisePrice: 4 }
const CHORI_SIN_USD = { id: 'chori', label: 'Choripán', price: 5000 }
const REGALO = { id: 'regalo', label: 'Vaso de regalo', price: 0 }

const catalog = (ticketTypes, addons = []) => ({ ticketTypes, addons })

describe('configuredTicketWiseUsd', () => {
  it('sólo acepta montos cobrables', () => {
    expect(configuredTicketWiseUsd({ wisePrice: 15 })).toBe(15)
    expect(configuredTicketWiseUsd({ wisePrice: '15' })).toBe(15)
    expect(configuredTicketWiseUsd({ wisePrice: 0 })).toBeNull()
    expect(configuredTicketWiseUsd({ wisePrice: -3 })).toBeNull()
    expect(configuredTicketWiseUsd({ wisePrice: null })).toBeNull()
    expect(configuredTicketWiseUsd({})).toBeNull()
  })
})

describe('resolveTicketOrderWisePricing', () => {
  it('suma los precios cargados cuando están todos', () => {
    const quote = resolveTicketOrderWisePricing(
      [
        { ticketTypeId: 'general', addonIds: ['chori'] },
        { ticketTypeId: 'coach', addonIds: [] },
      ],
      catalog([GENERAL, COACH], [CHORI]),
      ENV,
    )
    expect(quote).toMatchObject({ amount: 49, currency: 'USD', source: 'configured' })
    expect(quote.arsTotal).toBe(65000)
    expect(quote.missing).toEqual([])
  })

  it('un beneficio sin USD manda toda la orden a la conversión', () => {
    const quote = resolveTicketOrderWisePricing(
      [{ ticketTypeId: 'general', addonIds: ['chori'] }],
      catalog([GENERAL], [CHORI_SIN_USD]),
      ENV,
    )
    // 25.000 ARS / 1.000 = 25, ya múltiplo de 5: no se mezcla con el 15 cargado.
    expect(quote).toMatchObject({ amount: 25, source: 'converted' })
    expect(quote.missing).toEqual([{ kind: 'addon', id: 'chori', label: 'Choripán' }])
  })

  it('un beneficio gratis no necesita USD propio', () => {
    const quote = resolveTicketOrderWisePricing(
      [{ ticketTypeId: 'general', addonIds: ['regalo'] }],
      catalog([GENERAL], [REGALO]),
      ENV,
    )
    expect(quote).toMatchObject({ amount: 15, source: 'configured' })
    expect(quote.missing).toEqual([])
  })

  it('sin ningún precio cargado se comporta como antes: convierte y redondea hacia arriba', () => {
    const quote = resolveTicketOrderWisePricing(
      [{ ticketTypeId: 'general' }],
      catalog([{ id: 'general', name: 'General', price: 21000 }]),
      ENV,
    )
    expect(quote).toMatchObject({ amount: 25, source: 'converted', arsTotal: 21000 })
  })

  it('reporta el tipo sin precio una sola vez aunque se repita en la compra', () => {
    const quote = resolveTicketOrderWisePricing(
      [{ ticketTypeId: 'general' }, { ticketTypeId: 'general' }],
      catalog([{ id: 'general', name: 'General', price: 20000 }]),
      ENV,
    )
    expect(quote.missing).toEqual([{ kind: 'ticketType', id: 'general', label: 'General' }])
  })

  it('ignora un beneficio que ya no está en el catálogo, como hace la base', () => {
    const quote = resolveTicketOrderWisePricing(
      [{ ticketTypeId: 'general', addonIds: ['borrado'] }],
      catalog([GENERAL], [CHORI]),
      ENV,
    )
    expect(quote).toMatchObject({ amount: 15, source: 'configured', arsTotal: 20000 })
  })

  it('rompe si un asistente pide un tipo que no existe: cotizarlo en 0 sería regalarlo', () => {
    expect(() =>
      resolveTicketOrderWisePricing([{ ticketTypeId: 'fantasma' }], catalog([GENERAL]), ENV),
    ).toThrow('TICKET_TYPE_NOT_IN_CATALOG')
  })
})
