import { describe, expect, it } from 'vitest'
import { resolveEventPublishChecks } from '../src/lib/eventPublishChecks.js'
import { resolveEventSalesReadiness } from '../src/lib/eventSalesReadiness.js'

const platform = {
  paymentChannels: {
    membership: { mercado_pago: true, bank_transfer: false, cash_pitbull: false, wise_transfer: false },
    registration: { mercado_pago: true, bank_transfer: false, cash_pitbull: false, wise_transfer: false },
    ticket: { mercado_pago: true, bank_transfer: true, cash_pitbull: false, wise_transfer: false },
  },
}

const connectedProfile = {
  id: 'perfil-mp-1',
  active: true,
  connectionStatus: 'connected',
}

describe('resolveEventSalesReadiness', () => {
  it('verde con cuenta general (informativo) cuando el cobro está abierto', () => {
    expect(resolveEventSalesReadiness({ pricing: { ticketsEnabled: false } }, platform)).toEqual({
      level: 'green',
      mode: 'charge',
      codes: ['mpUsingPlatformDefault'],
    })
  })

  it('modo anuncio es verde y no exige medios de inscripción', () => {
    const event = {
      salesIntent: 'announce',
      pricing: { ticketsEnabled: false },
      paymentChannelOverrides: { registration: { mercado_pago: false } },
    }
    expect(resolveEventPublishChecks(event, platform)).toEqual(['salesAnnounceMode'])
    expect(resolveEventSalesReadiness(event, platform)).toEqual({
      level: 'green',
      mode: 'announce',
      codes: ['salesAnnounceMode'],
    })
  })

  it('rojo si el perfil MP necesita reconectar en modo cobro', () => {
    expect(
      resolveEventSalesReadiness(
        { mercadoPagoProfileId: connectedProfile.id, pricing: { ticketsEnabled: false } },
        platform,
        { mpProfiles: [{ ...connectedProfile, connectionStatus: 'needs_reconnect' }] },
      ).level,
    ).toBe('red')
  })

  it('amarillo si no hay medio de inscripción en modo cobro', () => {
    expect(
      resolveEventSalesReadiness(
        {
          paymentChannelOverrides: { registration: { mercado_pago: false } },
          pricing: { ticketsEnabled: false },
        },
        platform,
      ),
    ).toMatchObject({ level: 'yellow', mode: 'charge' })
  })

  it('anuncio con entradas mal configuradas sigue en rojo', () => {
    expect(
      resolveEventSalesReadiness(
        {
          salesIntent: 'announce',
          pricing: { ticketsEnabled: true },
          ticketTypes: [],
          paymentChannelOverrides: { ticket: { mercado_pago: false, bank_transfer: false } },
        },
        platform,
      ).level,
    ).toBe('red')
  })
})
