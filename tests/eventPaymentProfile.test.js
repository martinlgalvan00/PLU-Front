import { describe, expect, it } from 'vitest'
import { HttpError } from '../server/lib/errors.js'
import {
  applyEventPaymentChannelOverrides,
  assertEventBankTransferReady,
  assertEventPaymentChannelEnabled,
  isEventChannelOpen,
  normalizePaymentChannelOverrides,
  resolveBankTransferDetails,
} from '../server/modules/payments/eventPaymentProfile.js'

describe('normalizePaymentChannelOverrides', () => {
  it('devuelve null cuando no hay override', () => {
    expect(normalizePaymentChannelOverrides(null)).toBeNull()
    expect(normalizePaymentChannelOverrides(undefined)).toBeNull()
    expect(normalizePaymentChannelOverrides({})).toBeNull()
    expect(normalizePaymentChannelOverrides({ foo: true })).toBeNull()
  })

  it('expande la forma plana vieja a los dos conceptos', () => {
    // Las filas que ya existen guardan un solo juego de banderas. Significaba
    // "lo mismo para inscripción y entradas", y tiene que seguir significando
    // eso: si no, cambiar el formato cambiaría el cobro de eventos vivos.
    expect(
      normalizePaymentChannelOverrides({
        mercado_pago: false,
        bank_transfer: true,
        junk: true,
      }),
    ).toEqual({
      registration: { mercado_pago: false, bank_transfer: true },
      ticket: { mercado_pago: false, bank_transfer: true },
    })
  })

  it('conserva la forma por concepto', () => {
    expect(
      normalizePaymentChannelOverrides({
        registration: { cash_pitbull: true },
        ticket: { cash_pitbull: false, junk: true },
      }),
    ).toEqual({
      registration: { cash_pitbull: true },
      ticket: { cash_pitbull: false },
    })
  })
})

describe('isEventChannelOpen', () => {
  it('hereda plataforma cuando no hay override', () => {
    expect(isEventChannelOpen(true, null, 'mercado_pago')).toBe(true)
    expect(isEventChannelOpen(false, null, 'mercado_pago')).toBe(false)
  })

  it('el evento solo puede cerrar', () => {
    expect(isEventChannelOpen(true, { mercado_pago: false }, 'mercado_pago')).toBe(false)
    expect(isEventChannelOpen(false, { mercado_pago: true }, 'mercado_pago')).toBe(false)
    expect(isEventChannelOpen(true, { mercado_pago: false }, 'bank_transfer')).toBe(true)
  })
})

describe('applyEventPaymentChannelOverrides', () => {
  const base = {
    membershipEnabled: true,
    registrationEnabled: true,
    ticketEnabled: true,
    membershipManualEnabled: true,
    registrationManualEnabled: true,
    ticketManualEnabled: true,
    paymentChannels: {
      membership: {
        mercado_pago: true,
        bank_transfer: true,
        cash_pitbull: true,
        wise_transfer: false,
      },
      registration: {
        mercado_pago: true,
        bank_transfer: true,
        cash_pitbull: false,
        wise_transfer: false,
      },
      ticket: {
        mercado_pago: true,
        bank_transfer: true,
        cash_pitbull: false,
        wise_transfer: false,
      },
    },
  }

  it('no toca membership y cierra registration/ticket según override', () => {
    const next = applyEventPaymentChannelOverrides(base, { mercado_pago: false })
    expect(next.paymentChannels.membership.mercado_pago).toBe(true)
    expect(next.paymentChannels.registration.mercado_pago).toBe(false)
    expect(next.paymentChannels.registration.bank_transfer).toBe(true)
    expect(next.paymentChannels.ticket.mercado_pago).toBe(false)
    expect(next.registrationManualEnabled).toBe(true)
  })

  it('sin override deja la availability intacta', () => {
    expect(applyEventPaymentChannelOverrides(base, null)).toBe(base)
  })

  it('cierra un canal solo en el concepto que lo pide', () => {
    const next = applyEventPaymentChannelOverrides(base, {
      ticket: { bank_transfer: false },
    })
    expect(next.paymentChannels.registration.bank_transfer).toBe(true)
    expect(next.paymentChannels.ticket.bank_transfer).toBe(false)
    expect(next.paymentChannels.ticket.mercado_pago).toBe(true)
    expect(next.registrationManualEnabled).toBe(true)
    // Entradas se queda sin ningún canal manual: la transferencia era el único
    // abierto en la plataforma para ese concepto.
    expect(next.ticketManualEnabled).toBe(false)
  })
})

describe('resolveBankTransferDetails', () => {
  it('prioriza el evento sobre el env', () => {
    expect(
      resolveBankTransferDetails(
        {
          bank_transfer_alias: 'evento.alias',
          bank_transfer_cbu: '123',
          bank_transfer_holder: 'Org Evento',
        },
        {
          VITE_PAYMENT_TRANSFER_ALIAS: 'global.alias',
          VITE_PAYMENT_TRANSFER_CBU: '999',
          VITE_PAYMENT_TRANSFER_HOLDER: 'Global',
        },
      ),
    ).toEqual({ alias: 'evento.alias', cbu: '123', holder: 'Org Evento' })
  })

  it('prioriza el perfil vinculado sobre el evento', () => {
    expect(
      resolveBankTransferDetails(
        {
          bank_transfer_alias: 'evento.alias',
          bank_transfer_cbu: '123',
          bank_transfer_holder: 'Org Evento',
        },
        { VITE_PAYMENT_TRANSFER_ALIAS: 'global.alias' },
        { config: { alias: 'perfil.alias', cbu: '555', holder: 'Club' } },
      ),
    ).toEqual({ alias: 'perfil.alias', cbu: '555', holder: 'Club' })
  })

  it('cae al env cuando el evento no define datos', () => {
    expect(
      resolveBankTransferDetails(null, {
        PAYMENT_TRANSFER_ALIAS: 'plu.alias',
        PAYMENT_TRANSFER_CBU: '111',
        PAYMENT_TRANSFER_HOLDER: 'PLU',
      }),
    ).toEqual({ alias: 'plu.alias', cbu: '111', holder: 'PLU' })
  })
})

describe('assertEventBankTransferReady', () => {
  it('no exige alias si hereda plataforma', () => {
    expect(() =>
      assertEventBankTransferReady({ overrides: null, bankTransfer: {}, env: {} }),
    ).not.toThrow()
  })

  it('exige alias cuando personaliza y deja transferencia abierta', () => {
    expect(() =>
      assertEventBankTransferReady({
        overrides: { mercado_pago: false, bank_transfer: true },
        bankTransfer: { alias: '' },
        env: {},
      }),
    ).toThrowError(expect.objectContaining({ status: 400 }))
  })

  it('sigue exigiendo alias si la transferencia queda abierta en un solo concepto', () => {
    // El alias es uno solo para todo el evento: alcanza con que la
    // transferencia siga en pie para la inscripción.
    expect(() =>
      assertEventBankTransferReady({
        overrides: {
          registration: { bank_transfer: true },
          ticket: { bank_transfer: false },
        },
        bankTransfer: { alias: '' },
        env: {},
      }),
    ).toThrowError(expect.objectContaining({ status: 400 }))
  })

  it('no exige alias si la transferencia está cerrada en los dos', () => {
    expect(() =>
      assertEventBankTransferReady({
        overrides: {
          registration: { bank_transfer: false },
          ticket: { bank_transfer: false },
        },
        bankTransfer: { alias: '' },
        env: {},
      }),
    ).not.toThrow()
  })

  it('acepta alias del env', () => {
    expect(() =>
      assertEventBankTransferReady({
        overrides: { bank_transfer: true },
        bankTransfer: {},
        env: { VITE_PAYMENT_TRANSFER_ALIAS: 'plu.alias' },
      }),
    ).not.toThrow()
  })
})

describe('assertEventPaymentChannelEnabled', () => {
  const toggles = {
    paymentChannels: {
      membership: {
        mercado_pago: true,
        bank_transfer: true,
        cash_pitbull: true,
        wise_transfer: true,
      },
      registration: {
        mercado_pago: true,
        bank_transfer: true,
        cash_pitbull: true,
        wise_transfer: true,
      },
      ticket: {
        mercado_pago: true,
        bank_transfer: true,
        cash_pitbull: true,
        wise_transfer: true,
      },
    },
  }

  it('rechaza MP cuando el evento lo cerró', () => {
    expect(() =>
      assertEventPaymentChannelEnabled(toggles, 'registration', 'mercado_pago', {
        eventOverrides: { mercado_pago: false },
      }),
    ).toThrowError(
      expect.objectContaining({
        status: 409,
        details: { code: 'REGISTRATION_MERCADO_PAGO_DISABLED' },
      }),
    )
  })

  it('deja pasar transferencia con MP cerrado en el evento', () => {
    expect(() =>
      assertEventPaymentChannelEnabled(toggles, 'registration', 'bank_transfer', {
        eventOverrides: { mercado_pago: false },
      }),
    ).not.toThrow()
  })

  it('no aplica override a membership', () => {
    expect(() =>
      assertEventPaymentChannelEnabled(toggles, 'membership', 'mercado_pago', {
        eventOverrides: { mercado_pago: false },
      }),
    ).not.toThrow()
  })

  it('cerrar efectivo en entradas no lo cierra en inscripción', () => {
    const eventOverrides = { ticket: { cash_pitbull: false } }

    expect(() =>
      assertEventPaymentChannelEnabled(toggles, 'registration', 'cash_pitbull', {
        eventOverrides,
      }),
    ).not.toThrow()

    expect(() =>
      assertEventPaymentChannelEnabled(toggles, 'ticket', 'cash_pitbull', { eventOverrides }),
    ).toThrowError(
      expect.objectContaining({
        status: 409,
        details: { code: 'TICKET_CASH_PITBULL_DISABLED' },
      }),
    )
  })

  it('avisa cuando el concepto se quedó sin ningún medio', () => {
    expect(() =>
      assertEventPaymentChannelEnabled(toggles, 'ticket', 'mercado_pago', {
        eventOverrides: {
          ticket: {
            mercado_pago: false,
            bank_transfer: false,
            cash_pitbull: false,
            wise_transfer: false,
          },
        },
      }),
    ).toThrowError(
      expect.objectContaining({ status: 409, details: { code: 'TICKET_NO_PAYMENT_CHANNEL' } }),
    )
  })

  it('sigue respetando la plataforma cerrada', () => {
    const closed = {
      paymentChannels: {
        ...toggles.paymentChannels,
        registration: {
          mercado_pago: false,
          bank_transfer: true,
          cash_pitbull: false,
          wise_transfer: false,
        },
      },
    }
    expect(() =>
      assertEventPaymentChannelEnabled(closed, 'registration', 'mercado_pago', {
        eventOverrides: null,
      }),
    ).toThrow(HttpError)
  })
})
