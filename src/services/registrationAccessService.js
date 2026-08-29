import { apiGet, apiPost } from '../lib/api.js'

export async function fetchRegistrationAccessRequirements({ eventSlug } = {}) {
  const query = eventSlug ? `?eventSlug=${encodeURIComponent(eventSlug)}` : ''
  const result = await apiGet(`/api/athletes/me/registration-access-requirements${query}`)
  return {
    membership: result?.membership === true,
    registration: result?.registration === true,
    membershipEnabled: result?.membershipEnabled !== false,
    registrationEnabled: result?.registrationEnabled !== false,
    // Mercado Pago es el único canal disponible hasta una habilitación
    // explícita desde Administración. Ante una respuesta incompleta tampoco se
    // deben ofrecer transferencia ni efectivo.
    membershipManualEnabled: result?.membershipManualEnabled === true,
    registrationManualEnabled: result?.registrationManualEnabled === true,
    paymentChannels: result?.paymentChannels ?? null,
    bankTransfer: {
      alias: result?.bankTransfer?.alias ?? '',
      cbu: result?.bankTransfer?.cbu ?? '',
      holder: result?.bankTransfer?.holder ?? '',
    },
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
