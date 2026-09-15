import { describe, expect, it } from 'vitest'
import {
  makeTicketTypePricer,
  priceForAttendee,
  priceForOrder,
  priceForTicketType,
} from '../src/services/ticketService.js'

const pricing = {
  ticketTypes: [
    { id: 'general', price: 20000, manualPrice: 17000 },
    { id: 'sin-descuento', price: 15000, manualPrice: null },
  ],
  addons: [{ id: 'estacionamiento', label: 'Estacionamiento', price: 3000, enabled: true }],
}

describe('priceForTicketType — siempre Mercado Pago', () => {
  it('cotiza el precio de lista sin importar si el tipo tiene precio manual', () => {
    expect(priceForTicketType({ ticketTypeId: 'general' }, pricing)).toBe(20000)
    expect(priceForTicketType({ ticketTypeId: 'sin-descuento' }, pricing)).toBe(15000)
  })
})

describe('makeTicketTypePricer — precio por canal', () => {
  it.each(['transferencia', 'cash_pitbull'])(
    'cobra el precio manual del tipo por %s cuando está configurado',
    (paymentMethod) => {
      const pricer = makeTicketTypePricer(paymentMethod)
      expect(pricer({ ticketTypeId: 'general' }, pricing)).toBe(17000)
    },
  )

  it.each(['transferencia', 'cash_pitbull'])(
    'sin precio manual cargado, %s cobra igual que Mercado Pago',
    (paymentMethod) => {
      const pricer = makeTicketTypePricer(paymentMethod)
      expect(pricer({ ticketTypeId: 'sin-descuento' }, pricing)).toBe(15000)
    },
  )

  it('Mercado Pago siempre cobra el precio de lista', () => {
    const pricer = makeTicketTypePricer('mercado_pago')
    expect(pricer({ ticketTypeId: 'general' }, pricing)).toBe(20000)
  })

  it('Wise no usa el precio manual: cae al precio de lista en pesos', () => {
    const pricer = makeTicketTypePricer('wise_transfer')
    expect(pricer({ ticketTypeId: 'general' }, pricing)).toBe(20000)
  })

  it('un tipo de entrada inexistente cotiza 0', () => {
    const pricer = makeTicketTypePricer('transferencia')
    expect(pricer({ ticketTypeId: 'no-existe' }, pricing)).toBe(0)
  })
})

describe('priceForAttendee / priceForOrder — total por canal, addons incluidos', () => {
  const attendees = [
    { ticketTypeId: 'general', addonIds: ['estacionamiento'] },
    { ticketTypeId: 'sin-descuento', addonIds: [] },
  ]

  it('los addons se suman igual en cualquier canal: el descuento es solo de la entrada base', () => {
    const mpRow = priceForAttendee(attendees[0], pricing, pricing.addons, 'mercado_pago')
    const transferRow = priceForAttendee(attendees[0], pricing, pricing.addons, 'transferencia')
    expect(mpRow).toBe(20000 + 3000)
    expect(transferRow).toBe(17000 + 3000)
  })

  it('el total de la orden baja al elegir un canal manual, con carrito mixto', () => {
    const mpTotal = priceForOrder(attendees, pricing, pricing.addons, 'mercado_pago')
    const transferTotal = priceForOrder(attendees, pricing, pricing.addons, 'transferencia')
    // general: 20000 + 3000 addon; sin-descuento: 15000, sin manualPrice propio.
    expect(mpTotal).toBe(20000 + 3000 + 15000)
    expect(transferTotal).toBe(17000 + 3000 + 15000)
  })

  it('sin especificar medio de pago, el total por defecto es el de Mercado Pago', () => {
    expect(priceForOrder(attendees, pricing, pricing.addons)).toBe(
      priceForOrder(attendees, pricing, pricing.addons, 'mercado_pago'),
    )
  })
})
