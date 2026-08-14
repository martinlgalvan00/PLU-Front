import { HttpError } from '../lib/errors.js'

/**
 * Corte total controlado desde el panel, independiente de `PAID_CHECKOUT_ENABLED`
 * (legacy: sigue en el código como freno de emergencia si Supabase no
 * respondiera, pero ya no es la vía operativa) y de `registration_access_gates`
 * (tanda con código). Con el interruptor apagado nadie crea una orden nueva de
 * ese tipo, tenga o no código.
 *
 * Los tres validadores son sync y reciben el `toggles` ya leído: una ruta que
 * necesita más de uno (el combo exige los tres) hace una sola consulta a
 * Supabase y la reusa, en vez de repetirla por cada assert.
 */
export function assertCheckoutEnabled(toggles) {
  if (toggles?.checkoutEnabled === false) {
    throw new HttpError(409, 'Los cobros están pausados temporalmente.', {
      code: 'CHECKOUT_DISABLED',
    })
  }
}

export function assertMembershipCheckoutEnabled(toggles) {
  if (toggles?.membershipEnabled === false) {
    throw new HttpError(409, 'Las afiliaciones están cerradas temporalmente.', {
      code: 'MEMBERSHIP_CHECKOUT_DISABLED',
    })
  }
}

export function assertRegistrationCheckoutEnabled(toggles) {
  if (toggles?.registrationEnabled === false) {
    throw new HttpError(409, 'Las inscripciones están cerradas temporalmente.', {
      code: 'REGISTRATION_CHECKOUT_DISABLED',
    })
  }
}
