import { apiGet } from '../lib/api.js'

export const DEFAULT_PUBLIC_CHECKOUT_AVAILABILITY = {
  membershipEnabled: true,
  registrationEnabled: true,
  ticketEnabled: true,
  membershipManualEnabled: true,
  registrationManualEnabled: true,
  ticketManualEnabled: true,
}

export function normalizePublicCheckoutAvailability(result) {
  return {
    ...DEFAULT_PUBLIC_CHECKOUT_AVAILABILITY,
    ...Object.fromEntries(
      Object.keys(DEFAULT_PUBLIC_CHECKOUT_AVAILABILITY).map((key) => [
        key,
        result?.[key] !== false,
      ]),
    ),
  }
}

export async function fetchPublicCheckoutAvailability() {
  return normalizePublicCheckoutAvailability(await apiGet('/api/platform-settings/public'))
}
