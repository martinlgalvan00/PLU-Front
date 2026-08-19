import { apiGet } from '../lib/api.js'

export const DEFAULT_PUBLIC_CHECKOUT_AVAILABILITY = {
  membershipEnabled: true,
  registrationEnabled: true,
  ticketEnabled: true,
  membershipManualEnabled: true,
  registrationManualEnabled: true,
  ticketManualEnabled: true,
  // Excepción a "default abierto": Wise nace cerrado, sólo un `true`
  // explícito del servidor lo habilita.
  wiseEnabled: false,
}

export function normalizePublicCheckoutAvailability(result) {
  return {
    ...DEFAULT_PUBLIC_CHECKOUT_AVAILABILITY,
    ...Object.fromEntries(
      Object.keys(DEFAULT_PUBLIC_CHECKOUT_AVAILABILITY)
        .filter((key) => key !== 'wiseEnabled')
        .map((key) => [key, result?.[key] !== false]),
    ),
    wiseEnabled: result?.wiseEnabled === true,
  }
}

export async function fetchPublicCheckoutAvailability() {
  return normalizePublicCheckoutAvailability(await apiGet('/api/platform-settings/public'))
}
