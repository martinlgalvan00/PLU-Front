import { describe, expect, it } from 'vitest'
import {
  resolveEventPublishChecks,
  resolveEventPublishConfirmChecks,
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

const connectedProfile = {
  id: 'perfil-mp-1',
  active: true,
  connectionStatus: 'connected',
  config: { connection: 'oauth', status: 'connected' },
}

describe('resolveEventPublishChecks', () => {
  it('avisa cuando Mercado Pago hereda la cuenta general de la plataforma', () => {
    expect(resolveEventPublishChecks({ pricing: { ticketsEnabled: false } }, platform)).toEqual([
      'mpUsingPlatformDefault',
    ])
  })

  it('no avisa de destino MP si el evento tiene un perfil conectado', () => {
    expect(
      resolveEventPublishChecks(
        { pricing: { ticketsEnabled: false }, mercadoPagoProfileId: connectedProfile.id },
        platform,
        { mpProfiles: [connectedProfile] },
      ),
    ).toEqual([])
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
        mercadoPagoProfileId: connectedProfile.id,
      },
      platform,
      { mpProfiles: [connectedProfile] },
    )
    expect(noChannel).toContain('noTicketChannel')

    const noType = resolveEventPublishChecks(
      {
        pricing: { ticketsEnabled: true },
        ticketTypes: [{ active: false, price: 5000 }],
        mercadoPagoProfileId: connectedProfile.id,
      },
      platform,
      { mpProfiles: [connectedProfile] },
    )
    expect(noType).toContain('noSellableTicketType')
  })

  it('con las entradas apagadas no avisa de entradas', () => {
    expect(
      resolveEventPublishChecks(
        {
          pricing: { ticketsEnabled: false },
          paymentChannelOverrides: { ticket: { mercado_pago: false } },
          mercadoPagoProfileId: connectedProfile.id,
        },
        platform,
        { mpProfiles: [connectedProfile] },
      ),
    ).toEqual([])
  })

  it('avisa de transferencia abierta sin destino propio, y no si hay perfil o alias', () => {
    const open = {
      paymentChannelOverrides: { registration: { bank_transfer: 'open' } },
      mercadoPagoProfileId: connectedProfile.id,
    }
    expect(resolveEventPublishChecks(open, platform, { mpProfiles: [connectedProfile] })).toContain(
      'transferWithoutDestination',
    )
    expect(
      resolveEventPublishChecks(
        { ...open, bankTransferProfileId: 'perfil-1' },
        platform,
        { mpProfiles: [connectedProfile] },
      ),
    ).toEqual([])
    expect(
      resolveEventPublishChecks(
        { ...open, bankTransfer: { alias: 'club.pesas' } },
        platform,
        { mpProfiles: [connectedProfile] },
      ),
    ).toEqual([])
  })

  it('avisa si el perfil MP falta, está archivado o necesita reconectar', () => {
    expect(
      resolveEventPublishChecks(
        { mercadoPagoProfileId: 'perfil-desaparecido' },
        platform,
        { mpProfiles: [connectedProfile] },
      ),
    ).toContain('mpProfileMissing')

    expect(
      resolveEventPublishChecks(
        { mercadoPagoProfileId: connectedProfile.id },
        platform,
        { mpProfiles: [{ ...connectedProfile, active: false }] },
      ),
    ).toContain('mpProfileMissing')

    expect(
      resolveEventPublishChecks(
        { mercadoPagoProfileId: connectedProfile.id },
        platform,
        { mpProfiles: [{ ...connectedProfile, connectionStatus: 'needs_reconnect' }] },
      ),
    ).toContain('mpProfileNeedsReconnect')
  })

  it('usa mercadoPagoReadiness del API cuando viene en la fila', () => {
    expect(
      resolveEventPublishChecks(
        {
          mercadoPagoProfileId: 'perfil-mp-1',
          mercadoPagoReadiness: {
            destination: 'profile',
            connectionStatus: 'needs_reconnect',
          },
        },
        platform,
      ),
    ).toContain('mpProfileNeedsReconnect')

    expect(
      resolveEventPublishChecks(
        {
          mercadoPagoReadiness: { destination: 'platform', connectionStatus: null },
        },
        platform,
      ),
    ).toContain('mpUsingPlatformDefault')
  })

  it('sin lectura de plataforma rige la política por omisión (MP abierto → cuenta general)', () => {
    expect(resolveEventPublishChecks({}, null)).toEqual(['mpUsingPlatformDefault'])
  })

  it('el confirm de publicación omite el aviso informativo de cuenta general', () => {
    expect(resolveEventPublishConfirmChecks({}, platform)).toEqual([])
    expect(
      resolveEventPublishConfirmChecks(
        { mercadoPagoProfileId: connectedProfile.id },
        platform,
        { mpProfiles: [{ ...connectedProfile, connectionStatus: 'needs_reconnect' }] },
      ),
    ).toEqual(['mpProfileNeedsReconnect'])
  })

  it('avisa de efectivo abierto sin lugar ni sede, y no pide confirmacion', () => {
    const event = {
      paymentChannelOverrides: { registration: { cash_pitbull: 'open' } },
      mercadoPagoProfileId: connectedProfile.id,
    }
    expect(
      resolveEventPublishChecks(event, platform, { mpProfiles: [connectedProfile] }),
    ).toContain('cashWithoutVenue')
    expect(
      resolveEventPublishConfirmChecks(event, platform, { mpProfiles: [connectedProfile] }),
    ).not.toContain('cashWithoutVenue')
    expect(
      resolveEventPublishChecks(
        { ...event, venue: 'Maximal Strength Club' },
        platform,
        { mpProfiles: [connectedProfile] },
      ),
    ).not.toContain('cashWithoutVenue')
  })

  it('modo anuncio informa y no pide confirmación por falta de medios', () => {
    const event = {
      salesIntent: 'announce',
      paymentChannelOverrides: { registration: { mercado_pago: false } },
    }
    expect(resolveEventPublishChecks(event, platform)).toEqual(['salesAnnounceMode'])
    expect(resolveEventPublishConfirmChecks(event, platform)).toEqual([])
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
