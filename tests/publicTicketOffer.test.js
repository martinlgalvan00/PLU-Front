import { describe, expect, it } from 'vitest'
import { canBuyEventTickets } from '../src/lib/eventPublicActions.js'
import { resolvePublicTicketOffer, ticketOfferCopyKey } from '../src/lib/ticketSalesState.js'

/**
 * Calendario y compra leen esta función. Si el vivo y el catálogo discrepan,
 * los dos tienen que decir lo mismo: el interruptor que ya respondió el
 * checkout gana, y un corte distinto no se anuncia como "deshabilitadas".
 */

const NOW = new Date('2026-03-10T12:00:00')
const config = { ticketSalesEnabled: true }

function event(overrides = {}) {
  return {
    slug: 'pitbull-classic-2026',
    published: true,
    status: 'inscripcion_abierta',
    pricing: { ticketsEnabled: true },
    eventDays: [{ dayIndex: 0, label: 'Día 1' }],
    ticketTypes: [{ id: 'general', name: 'General', price: 20000, active: true }],
    ...overrides,
  }
}

const liveOn = {
  eventTicketsEnabled: true,
  ticketEnabled: true,
  channels: { mercado_pago: true },
}

describe('resolvePublicTicketOffer', () => {
  it('con el interruptor prendido y el vivo abierto, se puede comprar', () => {
    const offer = resolvePublicTicketOffer({ event: event(), live: liveOn, config, now: NOW })
    expect(offer).toMatchObject({ status: 'open', canBuy: true })
    expect(canBuyEventTickets(event(), { live: liveOn, config, now: NOW })).toBe(true)
    expect(ticketOfferCopyKey(offer)).toBeNull()
  })

  it('el vivo en true abre aunque el catálogo o el seed digan que está apagado', () => {
    const seed = event({ pricing: { ticketsEnabled: false } })
    const offer = resolvePublicTicketOffer({ event: seed, live: liveOn, config, now: NOW })
    expect(offer.status).toBe('open')
    expect(canBuyEventTickets(seed, { live: liveOn, config, now: NOW })).toBe(true)
  })

  it('el vivo en false cierra aunque ticketEnabled venga atrasado en true', () => {
    const offer = resolvePublicTicketOffer({
      event: event(),
      live: { eventTicketsEnabled: false, ticketEnabled: true },
      config,
      now: NOW,
    })
    expect(offer).toMatchObject({ status: 'off', reason: 'eventDisabled', canBuy: false })
    expect(ticketOfferCopyKey(offer)).toBe('pages.ticketOffer.off')
  })

  it('sin días cargados no se anuncia como falta de precio', () => {
    const offer = resolvePublicTicketOffer({
      event: event({ eventDays: [] }),
      live: liveOn,
      config,
      now: NOW,
    })
    expect(offer).toMatchObject({ status: 'blocked', reason: 'noDays', canBuy: false })
    expect(ticketOfferCopyKey(offer)).toBe('pages.ticketOffer.noDays')
  })

  it('si todas las ventanas de tipo ya cerraron, no dice que todavía no abrió', () => {
    const offer = resolvePublicTicketOffer({
      event: event({
        ticketTypes: [
          {
            id: 'general',
            price: 20000,
            active: true,
            salesOpensAt: '2026-01-01T00:00:00',
            salesClosesAt: '2026-02-01T00:00:00',
          },
        ],
      }),
      live: liveOn,
      config,
      now: NOW,
    })
    expect(offer).toMatchObject({ status: 'blocked', reason: 'windowClosed', canBuy: false })
    expect(ticketOfferCopyKey(offer)).toBe('pages.ticketOffer.windowClosed')
  })

  it('sin precio y con el interruptor prendido es un bloqueo, no un apagado', () => {
    const offer = resolvePublicTicketOffer({
      event: event({ ticketTypes: [{ id: 'general', price: 0, active: true }] }),
      live: liveOn,
      config,
      now: NOW,
    })
    expect(offer).toMatchObject({ status: 'blocked', reason: 'noPrice', canBuy: false })
    expect(ticketOfferCopyKey(offer)).toBe('pages.ticketOffer.noPrice')
  })

  it('mientras el catálogo no asentó y el vivo no respondió, no afirma que esté deshabilitada', () => {
    const offer = resolvePublicTicketOffer({
      event: event({ pricing: { ticketsEnabled: false } }),
      live: null,
      catalogSettled: false,
      config,
      now: NOW,
    })
    expect(offer).toMatchObject({ status: 'pending', canBuy: false })
    expect(ticketOfferCopyKey(offer)).toBeNull()
  })

  it('con el catálogo asentado y el interruptor apagado, cierra', () => {
    const offer = resolvePublicTicketOffer({
      event: event({ pricing: { ticketsEnabled: false } }),
      live: { eventTicketsEnabled: undefined, ticketEnabled: true },
      catalogSettled: true,
      config,
      now: NOW,
    })
    expect(offer.status).toBe('off')
  })

  it('un evento finalizado sigue cerrado aunque el vivo diga que el interruptor está prendido', () => {
    const offer = resolvePublicTicketOffer({
      event: event({ status: 'finalizado' }),
      live: liveOn,
      config,
      now: NOW,
    })
    expect(offer).toMatchObject({ status: 'off', reason: 'eventStatus' })
  })

  it('el freno de entorno no se disfraza de interruptor apagado', () => {
    const offer = resolvePublicTicketOffer({
      event: event(),
      live: liveOn,
      config: { ticketSalesEnabled: false },
      now: NOW,
    })
    expect(offer).toMatchObject({ status: 'blocked', reason: 'environment' })
    expect(ticketOfferCopyKey(offer)).toBe('pages.ticketOffer.environment')
  })

  it('sin medios de pago abiertos el motivo es el canal, no el interruptor', () => {
    const offer = resolvePublicTicketOffer({
      event: event(),
      live: {
        eventTicketsEnabled: true,
        ticketEnabled: false,
        channels: { mercado_pago: false, bank_transfer: false },
      },
      config,
      now: NOW,
    })
    expect(offer).toMatchObject({ status: 'blocked', reason: 'channels' })
  })
})
