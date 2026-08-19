import { apiGet, apiRequest } from '../lib/api.js'

/**
 * Interruptores de alta y de validación, uno por concepto, más el maestro. El
 * default es abierto: sólo un `false` explícito apaga uno.
 *
 * Los medios de pago no están acá: son una matriz concepto × canal
 * (`paymentChannels`) con su propio endpoint, porque cada canal se abre y cierra
 * por separado. Las claves `*ManualEnabled` que el backend sigue publicando son
 * derivadas —"algún canal manual abierto"— y se conservan como lectura
 * informativa, no como control.
 */
export const PLATFORM_TOGGLE_KEYS = [
  'checkoutEnabled',
  'membershipEnabled',
  'registrationEnabled',
  'ticketEnabled',
  'membershipValidationEnabled',
  'registrationValidationEnabled',
  'ticketValidationEnabled',
]

export const PLATFORM_DERIVED_KEYS = [
  'membershipManualEnabled',
  'registrationManualEnabled',
  'ticketManualEnabled',
]

export const PAYMENT_CONCEPTS = ['membership', 'registration', 'ticket']
export const PAYMENT_CHANNELS = ['mercado_pago', 'bank_transfer', 'cash_pitbull']

/**
 * Misma política por omisión que `server/services/platformFeatureToggleService.js`:
 * Mercado Pago abierto, canal manual de afiliación e inscripción cerrado hasta
 * habilitarlo, entradas sólo cerradas explícitamente. Se replica acá porque el
 * panel no importa código del server; en la práctica el payload trae las nueve
 * celdas y esto sólo cubre una lectura incompleta.
 */
function defaultChannelState(concept, channel) {
  if (channel === 'mercado_pago') return true
  return concept === 'ticket'
}

function normalizeChannels(channels) {
  return Object.fromEntries(
    PAYMENT_CONCEPTS.map((concept) => [
      concept,
      Object.fromEntries(
        PAYMENT_CHANNELS.map((channel) => {
          const cell = channels?.[concept]?.[channel]
          return [channel, typeof cell === 'boolean' ? cell : defaultChannelState(concept, channel)]
        }),
      ),
    ]),
  )
}

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
    ...Object.fromEntries(
      [...PLATFORM_TOGGLE_KEYS, ...PLATFORM_DERIVED_KEYS].map((key) => [
        key,
        result?.[key] !== false,
      ]),
    ),
    paymentChannels: normalizeChannels(result?.paymentChannels),
    // Variables de entorno que están frenando algo por encima del panel. El
    // panel las muestra para no dejar un interruptor en ON sin efecto.
    environmentHolds: Array.isArray(result?.environmentHolds) ? result.environmentHolds : [],
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

/** Una celda de la matriz. Devuelve el estado completo, igual que el toggle. */
export async function savePaymentChannel(concept, channel, enabled) {
  const result = await apiRequest('/api/platform-settings/channels', {
    method: 'PUT',
    body: JSON.stringify({ concept, channel, enabled }),
  })
  return mapToggles(result)
}
