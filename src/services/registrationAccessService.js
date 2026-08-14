import { apiGet, apiPost } from '../lib/api.js'

export async function fetchRegistrationAccessRequirements({ eventSlug } = {}) {
  const query = eventSlug ? `?eventSlug=${encodeURIComponent(eventSlug)}` : ''
  const result = await apiGet(`/api/athletes/me/registration-access-requirements${query}`)
  return {
    membership: result?.membership === true,
    registration: result?.registration === true,
    membershipEnabled: result?.membershipEnabled !== false,
    registrationEnabled: result?.registrationEnabled !== false,
    // Canal manual: con esto apagado el checkout no ofrece transferencia ni
    // efectivo, en vez de dejar que el 409 aparezca al enviar el formulario.
    membershipManualEnabled: result?.membershipManualEnabled !== false,
    registrationManualEnabled: result?.registrationManualEnabled !== false,
  }
}

/**
 * Valida el código de la tanda antes de abrir el checkout. Es solo para que el
 * modal pueda rechazar un código incorrecto en el momento: el permiso real lo
 * vuelve a chequear el alta de la orden, así que un `valid: true` de acá no
 * alcanza para pagar si el código dejó de servir.
 */
export async function verifyRegistrationAccessCode({ scope, eventSlug, code }) {
  const result = await apiPost('/api/athletes/me/registration-access/verify', {
    scope,
    ...(eventSlug ? { eventSlug } : {}),
    code,
  })
  return { valid: result?.valid === true, required: result?.required === true }
}
