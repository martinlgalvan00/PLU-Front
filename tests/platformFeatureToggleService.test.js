import { describe, expect, it } from 'vitest'
import {
  assertCheckoutEnabled,
  assertConceptValidationEnabled,
  assertManualChannelEnabled,
  assertMembershipCheckoutEnabled,
  assertRegistrationCheckoutEnabled,
  assertTicketCheckoutEnabled,
  assertValidationEnabled,
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

  it('exige habilitación explícita de lanzamiento para vender entradas al público', () => {
    const production = { NODE_ENV: 'production' }
    expect(() => assertTicketCheckoutEnabled({ ticketEnabled: true }, production)).toThrowError(
      thrown('TICKET_SALES_COMING_SOON'),
    )
    expect(() => assertTicketCheckoutEnabled({ ticketEnabled: true }, { ...production, TICKET_SALES_ENABLED: 'true' }))
      .not.toThrow()
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
    expect(() => assertManualChannelEnabled({}, 'ticket')).not.toThrow()
    expect(() => assertManualChannelEnabled({}, 'membership')).toThrowError(thrown('MEMBERSHIP_MANUAL_DISABLED'))
    expect(() => assertValidationEnabled(undefined, 'membership')).not.toThrow()
  })
})

describe('canal manual por concepto', () => {
  it('cierra transferencia y efectivo del concepto indicado solamente', () => {
    const toggles = {
      membershipManualEnabled: false,
      registrationManualEnabled: true,
      ticketManualEnabled: true,
    }
    expect(() => assertManualChannelEnabled(toggles, 'membership')).toThrowError(
      thrown('MEMBERSHIP_MANUAL_DISABLED'),
    )
    expect(() => assertManualChannelEnabled(toggles, 'registration')).not.toThrow()
    expect(() => assertManualChannelEnabled(toggles, 'ticket')).not.toThrow()
  })

  it('no confunde el canal manual con el alta del concepto', () => {
    // Alta abierta + canal manual cerrado: la afiliación sigue disponible por
    // Mercado Pago, que es justamente el caso de uso del interruptor.
    const toggles = { membershipEnabled: true, membershipManualEnabled: false }
    expect(() => assertMembershipCheckoutEnabled(toggles)).not.toThrow()
    expect(() => assertManualChannelEnabled(toggles, 'membership')).toThrow()
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
    expect(() => assertConceptValidationEnabled({ membershipValidationEnabled: false }, 'otro')).not.toThrow()
  })
})

describe('disponibilidad publicada al checkout', () => {
  it('el interruptor maestro cierra los tres conceptos y sus canales', () => {
    expect(resolvePublicCheckoutAvailability({ checkoutEnabled: false })).toEqual({
      membershipEnabled: false,
      registrationEnabled: false,
      ticketEnabled: false,
      membershipManualEnabled: false,
      registrationManualEnabled: false,
      ticketManualEnabled: false,
      wiseEnabled: false,
    })
  })

  it('wiseEnabled requiere habilitación explícita, independiente de los canales manuales locales', () => {
    expect(resolvePublicCheckoutAvailability({}).wiseEnabled).toBe(false)
    expect(
      resolvePublicCheckoutAvailability({ membershipManualEnabled: false, wiseEnabled: true }).wiseEnabled,
    ).toBe(true)
    // El maestro sigue cortando todo, Wise incluido.
    expect(
      resolvePublicCheckoutAvailability({ checkoutEnabled: false, wiseEnabled: true }).wiseEnabled,
    ).toBe(false)
  })

  it('un concepto cerrado arrastra su canal manual', () => {
    const availability = resolvePublicCheckoutAvailability({
      ticketEnabled: false,
      ticketManualEnabled: true,
    })
    expect(availability.ticketEnabled).toBe(false)
    expect(availability.ticketManualEnabled).toBe(false)
  })

  it('no publica venta de entradas antes del lanzamiento explícito', () => {
    const availability = resolvePublicCheckoutAvailability(
      { ticketEnabled: true, ticketManualEnabled: true },
      { NODE_ENV: 'production' },
    )
    expect(availability.ticketEnabled).toBe(false)
    expect(availability.ticketManualEnabled).toBe(false)
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
