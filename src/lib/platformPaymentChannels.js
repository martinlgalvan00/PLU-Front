import { EVENT_PAYMENT_CHANNELS } from './eventPaymentChannels.js'
import { defaultChannelState } from '../services/platformSettingsAdminService.js'

/** Celda cruda de Finanzas, o `undefined` si todavía no se sabe. */
export function platformChannelCell(platform, concept, channel) {
  const cell = platform?.paymentChannels?.[concept]?.[channel]
  return typeof cell === 'boolean' ? cell : undefined
}

/**
 * `{canal: bool}` de Finanzas para un concepto. Sin lectura (cargando o con
 * error) rige la política por omisión, la misma que aplica el servidor cuando
 * la matriz no trae la celda.
 */
export function platformCellsFor(platform, concept) {
  return Object.fromEntries(
    EVENT_PAYMENT_CHANNELS.map((channel) => [
      channel,
      platformChannelCell(platform, concept, channel) ?? defaultChannelState(concept, channel),
    ]),
  )
}
