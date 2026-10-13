import { describe, expect, it } from 'vitest'
import {
  resolveEventPublishChecks,
  summarizeEventPaymentChannels,
} from '../src/lib/eventPublishChecks.js'

/** Plataforma tal como la deja el lanzamiento: sólo Mercado Pago en inscripción. */
const platform = {
  paymentChannels: {
    membership: { mercado_pago: true, bank_transfer: false, cash_pitbull: false, wise_transfer: false },
    registration: { mercado_pago: true, bank_transfer: false, cash_pitbull: false, wise_transfer: false },
    ticket: { mercado_pago: true, bank_transfer: true, cash_pitbull: false, wise_transfer: false },
  },
}

const ticketType = { active: true, price: 15000 }

describe('resolveEventPublishChecks', () => {
  it('un evento que hereda una plataforma con Mercado Pago no tiene avisos', () => {
    expect(resolveEventPublishChecks({ pricing: { ticketsEnabled: false } }, platform)).toEqual([])
  })

  it('avisa cuando el evento cierra el último medio de inscripción', () => {
    expect(
      resolveEventPublishChecks(
        { paymentChannelOverrides: { registration: { mercado_pago: false } } },
        platform,
      ),
    ).toContain('noRegistrationChannel')
  })

  it('un medio que abre solo el evento cuenta como abierto', () => {
    const event = {
      paymentChannelOverrides: {
        registration: { mercado_pago: false, bank_transfer: 'open' },
      },
      bankTransferProfileId: 'perfil-1',
    }
    expect(resolveEventPublishChecks(event, platform)).toEqual([])
  })

  it('avisa de entradas habilitadas sin medio o sin tipo vendible', () => {
    const noChannel = resolveEventPublishChecks(
      {
        pricing: { ticketsEnabled: true },
        ticketTypes: [ticketType],
        paymentChannelOverrides: { ticket: { mercado_pago: false, bank_transfer: false } },
      },
      platform,
    )
    expect(noChannel).toContain('noTicketChannel')

    const noType = resolveEventPublishChecks(
      { pricing: { ticketsEnabled: true }, ticketTypes: [{ active: false, price: 5000 }] },
      platform,
    )
    expect(noType).toContain('noSellableTicketType')
  })

  it('con las entradas apagadas no avisa de entradas', () => {
    expect(
      resolveEventPublishChecks(
        { pricing: { ticketsEnabled: false }, paymentChannelOverrides: { ticket: { mercado_pago: false } } },
        platform,
      ),
    ).toEqual([])
  })

  it('avisa de transferencia abierta sin destino propio, y no si hay perfil o alias', () => {
    const open = { paymentChannelOverrides: { registration: { bank_transfer: 'open' } } }
    expect(resolveEventPublishChecks(open, platform)).toContain('transferWithoutDestination')
    expect(
      resolveEventPublishChecks({ ...open, bankTransferProfileId: 'perfil-1' }, platform),
    ).toEqual([])
    expect(
      resolveEventPublishChecks({ ...open, bankTransfer: { alias: 'club.pesas' } }, platform),
    ).toEqual([])
  })

  it('sin lectura de plataforma rige la política por omisión', () => {
    expect(resolveEventPublishChecks({}, null)).toEqual([])
  })
})

describe('summarizeEventPaymentChannels', () => {
  it('lista lo abierto por concepto y omite entradas si no se venden', () => {
    expect(summarizeEventPaymentChannels({}, platform)).toEqual({
      registration: ['mercado_pago'],
      ticket: null,
    })
    expect(
      summarizeEventPaymentChannels(
        { pricing: { ticketsEnabled: true }, paymentChannelOverrides: { registration: { cash_pitbull: 'open' } } },
        platform,
      ),
    ).toEqual({
      registration: ['mercado_pago', 'cash_pitbull'],
      ticket: ['mercado_pago', 'bank_transfer'],
    })
  })
})
