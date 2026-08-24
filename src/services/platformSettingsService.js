import { apiGet } from '../lib/api.js'
import { PAYMENT_CHANNELS } from '../lib/paymentChannels.js'

const CHECKOUT_CONCEPTS = ['membership', 'registration', 'ticket']

export const DEFAULT_PUBLIC_CHECKOUT_AVAILABILITY = {
  membershipEnabled: true,
  registrationEnabled: true,
  ticketEnabled: true,
  membershipManualEnabled: true,
  registrationManualEnabled: true,
  ticketManualEnabled: true,
}

function normalizePaymentChannels(channels) {
  return Object.fromEntries(
    CHECKOUT_CONCEPTS.map((concept) => [
      concept,
      Object.fromEntries(
        PAYMENT_CHANNELS.map((channel) => [
          channel,
          typeof channels?.[concept]?.[channel] === 'boolean'
            ? channels[concept][channel]
            : undefined,
        ]),
      ),
    ]),
  )
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
    paymentChannels: normalizePaymentChannels(result?.paymentChannels),
  }
}

export async function fetchPublicCheckoutAvailability() {
  return normalizePublicCheckoutAvailability(await apiGet('/api/platform-settings/public'))
}
