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

/**
 * Códigos que devuelve el backend (`server/services/platformFeatureToggleService.js`)
 * cuando una acción de validación/activación choca con un interruptor apagado
 * desde Acceso y habilitación. Sirven para que el frontend distinga ese 409
 * puntual de cualquier otro error y resincronice su copia local del toggle
 * (fetch único al montar la sección) en vez de mostrar el 409 crudo.
 */
export const VALIDATION_DISABLED_CODES = {
  membership: 'MEMBERSHIP_VALIDATION_DISABLED',
  registration: 'REGISTRATION_VALIDATION_DISABLED',
  ticket: 'TICKET_VALIDATION_DISABLED',
}

function mapToggles(result) {
  return {
    ...Object.fromEntries(PLATFORM_TOGGLE_KEYS.map((key) => [key, result?.[key] !== false])),
    // Wise es la excepción a "default abierto": nace cerrado y sólo un
    // `true` explícito lo prende (ver 20260825120000_wise_transfer_channel).
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
