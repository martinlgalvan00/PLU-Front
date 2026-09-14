import { describe, expect, it } from 'vitest'
import {
  allOpenTicketTypePaymentChannels,
  isTicketTypeChannelOpen,
  normalizeTicketTypePaymentChannels,
  resolveTicketTypeChannels,
  ticketTypeClosedChannels,
  ticketTypeHasOpenChannel,
} from '../src/lib/ticketTypePaymentChannels.js'

/**
 * Lo que se prueba acá es la cadena, no cada función suelta: plataforma →
 * evento → tipo de entrada, donde cada eslabón sólo puede CERRAR. El error que
 * esto previene es el inverso — que una entrada "reabra" un canal que Finanzas
 * o el evento cerraron y la compra rebote con 409 recién al confirmar.
 */

const TICKET_ONLY_MP_AND_TRANSFER = {
  ticket: {
    mercado_pago: true,
    bank_transfer: true,
    cash_pitbull: false,
    wise_transfer: false,
  },
  registration: {
    mercado_pago: true,
    bank_transfer: true,
    cash_pitbull: true,
    wise_transfer: true,
  },
}

describe('normalizeTicketTypePaymentChannels', () => {
  it('sin banderas conocidas devuelve null en vez de un override vacío', () => {
    expect(normalizeTicketTypePaymentChannels(null)).toBeNull()
    expect(normalizeTicketTypePaymentChannels({})).toBeNull()
    expect(normalizeTicketTypePaymentChannels({ paypal: true })).toBeNull()
    // Un objeto vacío significaría "sin medios"; null significa "los del
    // evento", que es lo que tienen todas las entradas ya cargadas.
    expect(normalizeTicketTypePaymentChannels([])).toBeNull()
  })

  it('se queda sólo con los cuatro canales y sólo con booleanos', () => {
    expect(
      normalizeTicketTypePaymentChannels({
        mercado_pago: true,
        cash_pitbull: false,
        wise_transfer: 'si',
        paypal: true,
      }),
    ).toEqual({ mercado_pago: true, cash_pitbull: false })
  })
})

describe('isTicketTypeChannelOpen', () => {
  it('sin override propio, todo abierto: el tipo hereda el evento', () => {
    expect(isTicketTypeChannelOpen(null, 'cash_pitbull')).toBe(true)
  })

  it('un canal que el override no menciona sigue abierto', () => {
    expect(isTicketTypeChannelOpen({ mercado_pago: true }, 'bank_transfer')).toBe(true)
  })

  it('sólo el false explícito cierra', () => {
    expect(isTicketTypeChannelOpen({ cash_pitbull: false }, 'cash_pitbull')).toBe(false)
  })
})

describe('resolveTicketTypeChannels', () => {
  it('sin overrides devuelve los cuatro, en orden canónico', () => {
    expect(resolveTicketTypeChannels()).toEqual([
      'mercado_pago',
      'bank_transfer',
      'cash_pitbull',
      'wise_transfer',
    ])
  })

  it('el tipo no puede reabrir lo que el evento cerró', () => {
    const open = resolveTicketTypeChannels({
      eventOverrides: TICKET_ONLY_MP_AND_TRANSFER,
      typeChannels: { cash_pitbull: true, wise_transfer: true },
    })
    expect(open).toEqual(['mercado_pago', 'bank_transfer'])
  })

  it('el tipo sí puede cerrar debajo del evento', () => {
    const open = resolveTicketTypeChannels({
      eventOverrides: TICKET_ONLY_MP_AND_TRANSFER,
      typeChannels: { bank_transfer: false },
    })
    expect(open).toEqual(['mercado_pago'])
  })

  it('la plataforma sigue siendo el techo de los dos', () => {
    const open = resolveTicketTypeChannels({
      eventOverrides: null,
      typeChannels: null,
      platformChannels: { mercado_pago: true, bank_transfer: false },
    })
    expect(open).toEqual(['mercado_pago'])
  })

  it('cerrar el último canal deja la entrada sin forma de comprarse', () => {
    expect(
      ticketTypeHasOpenChannel({
        eventOverrides: TICKET_ONLY_MP_AND_TRANSFER,
        typeChannels: { mercado_pago: false, bank_transfer: false },
      }),
    ).toBe(false)
  })

  it('el override plano viejo del evento vale para los dos conceptos', () => {
    const open = resolveTicketTypeChannels({
      eventOverrides: { cash_pitbull: false, wise_transfer: false },
      typeChannels: null,
    })
    expect(open).toEqual(['mercado_pago', 'bank_transfer'])
  })
})

describe('ticketTypeClosedChannels', () => {
  it('sólo cuenta lo que cerró la entrada, no lo que ya venía cerrado del evento', () => {
    const closed = ticketTypeClosedChannels({
      eventOverrides: TICKET_ONLY_MP_AND_TRANSFER,
      typeChannels: { bank_transfer: false, cash_pitbull: false },
    })
    // cash_pitbull ya estaba cerrado para todo el evento: no es una decisión
    // de esta entrada y mostrarla como tal confunde de quién es el cierre.
    expect(closed).toEqual(['bank_transfer'])
  })

  it('heredando no hay nada cerrado por la entrada', () => {
    expect(ticketTypeClosedChannels({ eventOverrides: TICKET_ONLY_MP_AND_TRANSFER })).toEqual([])
  })
})

describe('allOpenTicketTypePaymentChannels', () => {
  it('arranca abriendo todo lo que el evento deja abierto', () => {
    expect(allOpenTicketTypePaymentChannels(TICKET_ONLY_MP_AND_TRANSFER)).toEqual({
      mercado_pago: true,
      bank_transfer: true,
    })
  })

  it('no guarda en false lo que el evento ya cerró: no es una decisión de la entrada', () => {
    const seed = allOpenTicketTypePaymentChannels(TICKET_ONLY_MP_AND_TRANSFER)
    expect(Object.keys(seed)).not.toContain('cash_pitbull')
    // Y el seed siempre deja al menos uno abierto, que es lo que exige el
    // constraint de ticket_types.payment_channels.
    expect(Object.values(seed).some(Boolean)).toBe(true)
  })
})
