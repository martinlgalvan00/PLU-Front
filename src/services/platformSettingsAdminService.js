import { apiGet, apiRequest } from '../lib/api.js'

/**
 * Tres ejes por concepto: alta de órdenes, canal manual (transferencia y
 * efectivo) y validación/activación desde el panel. `checkout` corta los tres.
 * El default es abierto: sólo un `false` explícito apaga un interruptor.
 */
export const PLATFORM_TOGGLE_KEYS = [
  'checkoutEnabled',
  'membershipEnabled',
  'registrationEnabled',
  'ticketEnabled',
  'membershipManualEnabled',
  'registrationManualEnabled',
  'ticketManualEnabled',
  'membershipValidationEnabled',
  'registrationValidationEnabled',
  'ticketValidationEnabled',
]

function mapToggles(result) {
  return {
    ...Object.fromEntries(PLATFORM_TOGGLE_KEYS.map((key) => [key, result?.[key] !== false])),
    // Wise es la excepción a "default abierto": nace cerrado y sólo un
    // `true` explícito lo prende (ver 20260825100000_wise_transfer_channel).
    wiseEnabled: result?.wiseEnabled === true,
    updatedBy: result?.updatedBy ?? null,
    updatedAt: result?.updatedAt ?? null,
  }
}

export async function fetchPlatformFeatureToggles() {
  return mapToggles(await apiGet('/api/platform-settings'))
}

export async function savePlatformFeatureToggle(feature, enabled) {
  const result = await apiRequest('/api/platform-settings', {
    method: 'PUT',
    body: JSON.stringify({ feature, enabled }),
  })
  return mapToggles(result)
}
