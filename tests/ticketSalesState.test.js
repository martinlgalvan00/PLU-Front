import { describe, expect, it } from 'vitest'
import { resolveTicketSalesState } from '../src/lib/ticketSalesState.js'

/**
 * El valor de esto no es el booleano: es el motivo. Un panel que dice "cerrada"
 * sin decir cuál de los seis controles cortó es el estado anterior con otro
 * color, así que lo que se prueba acá es qué códigos salen y en qué orden.
 */

const NOW = new Date('2026-03-10T12:00:00')

const OPEN_PLATFORM = {
  checkoutEnabled: true,
  ticketEnabled: true,
  environmentHolds: [],
  paymentChannels: {
    ticket: {
      mercado_pago: true,
      bank_transfer: true,
      cash_pitbull: true,
      wise_transfer: false,
    },
  },
}

function baseEvent(overrides = {}) {
  return {
    published: true,
    status: 'inscripcion_abierta',
    pricing: { ticketsEnabled: true },
    ticketSalesOpensAt: '',
    ticketSalesClosesAt: '',
    eventDays: [{ dayIndex: 0, label: 'Día 1' }],
    ticketTypes: [{ id: 'general', name: 'General', price: 20000, active: true }],
    paymentChannelOverrides: null,
    ...overrides,
  }
}

const codes = (state) => state.blockers.map((blocker) => blocker.code)

describe('resolveTicketSalesState', () => {
  it('con todo en orden la venta está abierta y dice con qué se cobra', () => {
    const state = resolveTicketSalesState({
      event: baseEvent(),
      platform: OPEN_PLATFORM,
      now: NOW,
    })
    expect(state.open).toBe(true)
    expect(state.blockers).toEqual([])
    expect(state.openChannels).toEqual(['mercado_pago', 'bank_transfer', 'cash_pitbull'])
    expect(state.typesInWindow).toBe(1)
  })

  it('el freno de entorno se reporta aparte de los interruptores del panel', () => {
    const state = resolveTicketSalesState({
      event: baseEvent(),
      platform: {
        ...OPEN_PLATFORM,
        environmentHolds: [{ variable: 'TICKET_SALES_ENABLED', scope: 'ticket' }],
      },
      now: NOW,
    })
    expect(codes(state)).toEqual(['environmentHold'])
    expect(state.blockers[0]).toMatchObject({
      scope: 'environment',
      detail: 'TICKET_SALES_ENABLED',
    })
  })

  it('distingue el interruptor de plataforma del del evento', () => {
    expect(
      codes(
        resolveTicketSalesState({
          event: baseEvent(),
          platform: { ...OPEN_PLATFORM, ticketEnabled: false },
          now: NOW,
        }),
      ),
    ).toEqual(['platformTicket'])

    expect(
      codes(
        resolveTicketSalesState({
          event: baseEvent({ pricing: { ticketsEnabled: false } }),
          platform: OPEN_PLATFORM,
          now: NOW,
        }),
      ),
    ).toEqual(['eventDisabled'])
  })

  it('separa "no hay tipos vendibles" de "los que hay están fuera de su ventana"', () => {
    const sinPrecio = resolveTicketSalesState({
      event: baseEvent({ ticketTypes: [{ id: 'a', name: 'General', price: 0, active: true }] }),
      platform: OPEN_PLATFORM,
      now: NOW,
    })
    expect(codes(sinPrecio)).toEqual(['noSellableType'])

    const fueraDeVentana = resolveTicketSalesState({
      event: baseEvent({
        ticketTypes: [
          {
            id: 'a',
            name: 'Preventa',
            price: 20000,
            active: true,
            salesClosesAt: '2026-03-01T23:59',
          },
        ],
      }),
      platform: OPEN_PLATFORM,
      now: NOW,
    })
    expect(codes(fueraDeVentana)).toEqual(['noTypeInWindow'])
    expect(fueraDeVentana.sellableTypes).toBe(1)
    expect(fueraDeVentana.typesInWindow).toBe(0)
  })

  it('la ventana del evento distingue "todavía no abrió" de "ya cerró"', () => {
    expect(
      codes(
        resolveTicketSalesState({
          event: baseEvent({ ticketSalesOpensAt: '2026-04-01T10:00' }),
          platform: OPEN_PLATFORM,
          now: NOW,
        }),
      ),
    ).toEqual(['windowUpcoming'])

    expect(
      codes(
        resolveTicketSalesState({
          event: baseEvent({ ticketSalesClosesAt: '2026-02-01T10:00' }),
          platform: OPEN_PLATFORM,
          now: NOW,
        }),
      ),
    ).toEqual(['windowClosed'])
  })

  it('el evento cierra canales sobre la plataforma, nunca los reabre', () => {
    const state = resolveTicketSalesState({
      event: baseEvent({
        paymentChannelOverrides: {
          ticket: { mercado_pago: false, bank_transfer: true, cash_pitbull: false, wise_transfer: true },
        },
      }),
      platform: OPEN_PLATFORM,
      now: NOW,
    })
    // wise_transfer sigue cerrado: la plataforma es el techo.
    expect(state.openChannels).toEqual(['bank_transfer'])
    expect(state.open).toBe(true)
  })

  it('sin ningún canal abierto avisa antes de que la compra rebote con 409', () => {
    const state = resolveTicketSalesState({
      event: baseEvent({
        paymentChannelOverrides: {
          ticket: {
            mercado_pago: false,
            bank_transfer: false,
            cash_pitbull: false,
            wise_transfer: false,
          },
        },
      }),
      platform: OPEN_PLATFORM,
      now: NOW,
    })
    expect(codes(state)).toEqual(['noChannel'])
    expect(state.blockers[0].scope).toBe('platform')
  })

  it('sin lectura de plataforma evalúa igual lo que el editor puede arreglar', () => {
    const state = resolveTicketSalesState({
      event: baseEvent({ published: false }),
      now: NOW,
    })
    expect(codes(state)).toEqual(['unpublished'])
  })

  it('acumula todos los motivos, no sólo el primero', () => {
    const state = resolveTicketSalesState({
      event: baseEvent({
        published: false,
        status: 'finalizado',
        pricing: { ticketsEnabled: false },
        eventDays: [],
        ticketTypes: [],
      }),
      platform: { ...OPEN_PLATFORM, checkoutEnabled: false },
      now: NOW,
    })
    expect(codes(state)).toEqual([
      'platformCheckout',
      'eventDisabled',
      'unpublished',
      'eventStatus',
      'noDays',
      'noSellableType',
    ])
  })
})
