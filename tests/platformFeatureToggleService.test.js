import { describe, expect, it } from 'vitest'
import {
  assertCheckoutEnabled,
  assertConceptValidationEnabled,
  assertMembershipCheckoutEnabled,
  assertPaymentChannelEnabled,
  assertRegistrationCheckoutEnabled,
  assertTicketCheckoutEnabled,
  assertValidationEnabled,
  resolveChannelState,
  resolvePublicCheckoutAvailability,
} from '../server/services/platformFeatureToggleService.js'

const thrown = (code) => expect.objectContaining({ status: 409, details: { code } })

// Validadores sync sobre un `toggles` ya leído: la ruta hace una sola
// consulta a Supabase y la reusa para los tres checks, en vez de repetirla.
describe('interruptores generales de cobro, afiliación e inscripción', () => {
  it('no bloquea cuando los interruptores están habilitados', () => {
    const toggles = { checkoutEnabled: true, membershipEnabled: true, registrationEnabled: true }
    expect(() => assertCheckoutEnabled(toggles)).not.toThrow()
    expect(() => assertMembershipCheckoutEnabled(toggles)).not.toThrow()
    expect(() => assertRegistrationCheckoutEnabled(toggles)).not.toThrow()
  })

  it('rechaza todo el checkout cuando el interruptor maestro está apagado', () => {
    expect(() => assertCheckoutEnabled({ checkoutEnabled: false })).toThrowError(
      expect.objectContaining({ status: 409, details: { code: 'CHECKOUT_DISABLED' } }),
    )
  })

  it('rechaza afiliaciones cuando el interruptor está apagado, sin tocar inscripciones', () => {
    const toggles = { membershipEnabled: false, registrationEnabled: true }
    expect(() => assertMembershipCheckoutEnabled(toggles)).toThrowError(
      expect.objectContaining({ status: 409, details: { code: 'MEMBERSHIP_CHECKOUT_DISABLED' } }),
    )
    expect(() => assertRegistrationCheckoutEnabled(toggles)).not.toThrow()
  })

  it('rechaza inscripciones cuando el interruptor está apagado, sin tocar afiliaciones', () => {
    const toggles = { membershipEnabled: true, registrationEnabled: false }
    expect(() => assertRegistrationCheckoutEnabled(toggles)).toThrowError(
      expect.objectContaining({ status: 409, details: { code: 'REGISTRATION_CHECKOUT_DISABLED' } }),
    )
    expect(() => assertMembershipCheckoutEnabled(toggles)).not.toThrow()
  })

  it('rechaza la venta de entradas cuando el interruptor está apagado', () => {
    expect(() => assertTicketCheckoutEnabled({ ticketEnabled: false })).toThrowError(
      thrown('TICKET_CHECKOUT_DISABLED'),
    )
    expect(() => assertTicketCheckoutEnabled({ ticketEnabled: true })).not.toThrow()
  })

  // `TICKET_SALES_ENABLED` pasó a ser freno de emergencia: el panel es la vía
  // operativa. Antes, sin variable, el interruptor del panel se podía prender
  // sin efecto alguno.
  it('deja que el panel abra la venta de entradas sin variable de entorno', () => {
    const production = { NODE_ENV: 'production' }
    expect(() => assertTicketCheckoutEnabled({ ticketEnabled: true }, production)).not.toThrow()
    expect(() =>
      assertTicketCheckoutEnabled(
        { ticketEnabled: true },
        { ...production, TICKET_SALES_ENABLED: 'true' },
      ),
    ).not.toThrow()
  })

  it('respeta el freno de entorno cuando está explícitamente apagado', () => {
    expect(() =>
      assertTicketCheckoutEnabled({ ticketEnabled: true }, { TICKET_SALES_ENABLED: 'false' }),
    ).toThrowError(thrown('TICKET_SALES_COMING_SOON'))
  })

  // Las altas siguen abiertas, pero afiliaciones e inscripciones no ofrecen
  // canal manual hasta que Administración lo habilite explícitamente.
  it('mantiene las altas abiertas y exige habilitación explícita para el canal manual', () => {
    for (const assert of [
      assertCheckoutEnabled,
      assertMembershipCheckoutEnabled,
      assertRegistrationCheckoutEnabled,
      assertTicketCheckoutEnabled,
    ]) {
      expect(() => assert({})).not.toThrow()
      expect(() => assert(undefined)).not.toThrow()
    }
    expect(() => assertPaymentChannelEnabled({}, 'ticket', 'bank_transfer')).not.toThrow()
    expect(() => assertPaymentChannelEnabled({}, 'membership', 'bank_transfer')).toThrowError(
      thrown('MEMBERSHIP_MANUAL_DISABLED'),
    )
    expect(() => assertPaymentChannelEnabled({}, 'membership', 'mercado_pago')).not.toThrow()
    expect(() => assertValidationEnabled(undefined, 'membership')).not.toThrow()
  })
})

describe('canales de pago por concepto', () => {
  const matrix = (overrides = {}) => ({
    paymentChannels: {
      membership: { mercado_pago: true, bank_transfer: true, cash_pitbull: true, wise_transfer: true },
      registration: { mercado_pago: true, bank_transfer: true, cash_pitbull: true, wise_transfer: true },
      ticket: { mercado_pago: true, bank_transfer: true, cash_pitbull: true, wise_transfer: true },
      ...overrides,
    },
  })

  it('cierra un solo canal sin tocar los otros dos', () => {
    const toggles = matrix({
      membership: { mercado_pago: true, bank_transfer: false, cash_pitbull: true },
    })
    expect(() => assertPaymentChannelEnabled(toggles, 'membership', 'bank_transfer')).toThrowError(
      thrown('MEMBERSHIP_BANK_TRANSFER_DISABLED'),
    )
    expect(() => assertPaymentChannelEnabled(toggles, 'membership', 'cash_pitbull')).not.toThrow()
    expect(() => assertPaymentChannelEnabled(toggles, 'membership', 'mercado_pago')).not.toThrow()
  })

  // Lo que antes era imposible: la pasarela ya no es incondicional.
  it('cierra Mercado Pago dejando abierto el cobro manual', () => {
    const toggles = matrix({
      registration: { mercado_pago: false, bank_transfer: true, cash_pitbull: false },
    })
    expect(() =>
      assertPaymentChannelEnabled(toggles, 'registration', 'mercado_pago'),
    ).toThrowError(thrown('REGISTRATION_MERCADO_PAGO_DISABLED'))
    expect(() => assertPaymentChannelEnabled(toggles, 'registration', 'bank_transfer')).not.toThrow()
  })

  it('avisa distinto cuando el concepto no tiene ningún medio abierto', () => {
    const toggles = matrix({
      ticket: { mercado_pago: false, bank_transfer: false, cash_pitbull: false },
    })
    for (const channel of ['mercado_pago', 'bank_transfer', 'cash_pitbull']) {
      expect(() => assertPaymentChannelEnabled(toggles, 'ticket', channel)).toThrowError(
        thrown('TICKET_NO_PAYMENT_CHANNEL'),
      )
    }
  })

  it('conserva el código del contrato anterior con los dos canales manuales cerrados', () => {
    const toggles = matrix({
      membership: { mercado_pago: true, bank_transfer: false, cash_pitbull: false },
    })
    for (const channel of ['bank_transfer', 'cash_pitbull']) {
      expect(() => assertPaymentChannelEnabled(toggles, 'membership', channel)).toThrowError(
        thrown('MEMBERSHIP_MANUAL_DISABLED'),
      )
    }
  })

  it('un cupón destraba el canal manual pero nunca la pasarela cerrada', () => {
    const toggles = matrix({
      membership: { mercado_pago: false, bank_transfer: false, cash_pitbull: false },
    })
    expect(() =>
      assertPaymentChannelEnabled(toggles, 'membership', 'bank_transfer', { override: true }),
    ).not.toThrow()
    expect(() =>
      assertPaymentChannelEnabled(toggles, 'membership', 'mercado_pago', { override: true }),
    ).toThrowError(thrown('MEMBERSHIP_NO_PAYMENT_CHANNEL'))
  })

  it('no confunde el canal con el alta del concepto', () => {
    // Alta abierta + canal manual cerrado: la afiliación sigue disponible por
    // Mercado Pago, que es justamente el caso de uso del interruptor.
    const toggles = { membershipEnabled: true, membershipManualEnabled: false }
    expect(() => assertMembershipCheckoutEnabled(toggles)).not.toThrow()
    expect(() => assertPaymentChannelEnabled(toggles, 'membership', 'bank_transfer')).toThrow()
  })

  // Wise nace cerrado y no comparte código de error ni override con
  // transferencia/efectivo: es una celda más de la matriz, sin herencia de
  // ningún interruptor previo.
  it('Wise nace cerrado por defecto, sin depender de ningún otro interruptor', () => {
    expect(() => assertPaymentChannelEnabled({}, 'membership', 'wise_transfer')).toThrowError(
      thrown('MEMBERSHIP_WISE_TRANSFER_DISABLED'),
    )
    expect(resolveChannelState({}, 'ticket', 'wise_transfer')).toBe(false)
  })

  it('abrir Wise no reabre ni cierra transferencia/efectivo, y viceversa', () => {
    const toggles = matrix({
      membership: { mercado_pago: true, bank_transfer: false, cash_pitbull: false, wise_transfer: true },
    })
    expect(() => assertPaymentChannelEnabled(toggles, 'membership', 'wise_transfer')).not.toThrow()
    expect(() => assertPaymentChannelEnabled(toggles, 'membership', 'bank_transfer')).toThrowError(
      thrown('MEMBERSHIP_MANUAL_DISABLED'),
    )
  })

  it('un cupón no destraba Wise: el override sólo aplica a los canales manuales tradicionales', () => {
    const toggles = matrix({
      membership: { mercado_pago: true, bank_transfer: false, cash_pitbull: false, wise_transfer: false },
    })
    expect(() =>
      assertPaymentChannelEnabled(toggles, 'membership', 'wise_transfer', { override: true }),
    ).toThrowError(thrown('MEMBERSHIP_WISE_TRANSFER_DISABLED'))
  })
})

describe('validación y activación por concepto', () => {
  it('congela un concepto sin tocar los otros', () => {
    const toggles = {
      membershipValidationEnabled: true,
      registrationValidationEnabled: false,
      ticketValidationEnabled: true,
    }
    expect(() => assertValidationEnabled(toggles, 'registration')).toThrowError(
      thrown('REGISTRATION_VALIDATION_DISABLED'),
    )
    expect(() => assertValidationEnabled(toggles, 'membership')).not.toThrow()
    expect(() => assertValidationEnabled(toggles, 'ticket')).not.toThrow()
  })

  // El combo acredita afiliación e inscripción en la misma transacción: si
  // cualquiera de las dos está congelada no se puede aprobar.
  it('bloquea el combo cuando cualquiera de sus dos conceptos está congelado', () => {
    expect(() =>
      assertConceptValidationEnabled({ registrationValidationEnabled: false }, 'combo'),
    ).toThrowError(thrown('REGISTRATION_VALIDATION_DISABLED'))
    expect(() =>
      assertConceptValidationEnabled({ membershipValidationEnabled: false }, 'combo'),
    ).toThrowError(thrown('MEMBERSHIP_VALIDATION_DISABLED'))
    expect(() => assertConceptValidationEnabled({}, 'combo')).not.toThrow()
  })

  it('ignora conceptos que no se validan a mano', () => {
    expect(() =>
      assertConceptValidationEnabled({ membershipValidationEnabled: false }, 'otro'),
    ).not.toThrow()
  })
})

describe('disponibilidad publicada al checkout', () => {
  it('el interruptor maestro cierra los tres conceptos y sus canales', () => {
    const closed = { mercado_pago: false, bank_transfer: false, cash_pitbull: false, wise_transfer: false }
    expect(resolvePublicCheckoutAvailability({ checkoutEnabled: false })).toEqual({
      membershipEnabled: false,
      registrationEnabled: false,
      ticketEnabled: false,
      membershipManualEnabled: false,
      registrationManualEnabled: false,
      ticketManualEnabled: false,
      paymentChannels: { membership: closed, registration: closed, ticket: closed },
    })
  })

  it('un concepto cerrado arrastra su canal manual', () => {
    const availability = resolvePublicCheckoutAvailability({
      ticketEnabled: false,
      ticketManualEnabled: true,
    })
    expect(availability.ticketEnabled).toBe(false)
    expect(availability.ticketManualEnabled).toBe(false)
  })

  it('publica la venta de entradas que abrió el panel, sin variable de entorno', () => {
    const availability = resolvePublicCheckoutAvailability(
      { ticketEnabled: true, ticketManualEnabled: true },
      { NODE_ENV: 'production' },
    )
    expect(availability.ticketEnabled).toBe(true)
    expect(availability.ticketManualEnabled).toBe(true)
  })

  it('no publica entradas con el freno de entorno apagado explícitamente', () => {
    const availability = resolvePublicCheckoutAvailability(
      { ticketEnabled: true, ticketManualEnabled: true },
      { NODE_ENV: 'production', TICKET_SALES_ENABLED: 'false' },
    )
    expect(availability.ticketEnabled).toBe(false)
    expect(availability.ticketManualEnabled).toBe(false)
    expect(availability.paymentChannels.ticket.mercado_pago).toBe(false)
  })

  it('publica la matriz celda por celda, cruzada con el alta', () => {
    const availability = resolvePublicCheckoutAvailability({
      membershipEnabled: true,
      registrationEnabled: false,
      paymentChannels: {
        membership: { mercado_pago: false, bank_transfer: true, cash_pitbull: false },
        registration: { mercado_pago: true, bank_transfer: true, cash_pitbull: true },
        ticket: { mercado_pago: true, bank_transfer: false, cash_pitbull: false },
      },
    })
    expect(availability.paymentChannels.membership).toEqual({
      mercado_pago: false,
      bank_transfer: true,
      cash_pitbull: false,
      wise_transfer: false,
    })
    expect(availability.membershipManualEnabled).toBe(true)
    // Alta cerrada: ninguna celda del concepto se publica abierta.
    expect(availability.paymentChannels.registration).toEqual({
      mercado_pago: false,
      bank_transfer: false,
      cash_pitbull: false,
      wise_transfer: false,
    })
  })

  it('deja el concepto abierto con el canal manual cerrado', () => {
    const availability = resolvePublicCheckoutAvailability({ membershipManualEnabled: false })
    expect(availability.membershipEnabled).toBe(true)
    expect(availability.membershipManualEnabled).toBe(false)
  })

  it('publica un canal manual sólo con habilitación explícita', () => {
    const availability = resolvePublicCheckoutAvailability({
      membershipManualEnabled: true,
      registrationManualEnabled: true,
    })
    expect(availability.membershipManualEnabled).toBe(true)
    expect(availability.registrationManualEnabled).toBe(true)
  })
})
