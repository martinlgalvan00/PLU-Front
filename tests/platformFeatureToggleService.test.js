import { describe, expect, it } from 'vitest'
import {
  assertCheckoutEnabled,
  assertMembershipCheckoutEnabled,
  assertRegistrationCheckoutEnabled,
} from '../server/services/platformFeatureToggleService.js'

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
})
