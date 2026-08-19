/**
 * Lectura de la matriz de medios de cobro que publica
 * `GET /api/platform-settings/public` (y los requisitos de checkout del atleta).
 *
 * La matriz llega ya cruzada con el interruptor maestro y con el alta del
 * concepto, así que la pantalla sólo tiene que leer la celda.
 */
export const PAYMENT_CHANNELS = ['mercado_pago', 'bank_transfer', 'cash_pitbull']

/**
 * Default abierto: mientras el dato no llegó, la pantalla se arma completa y el
 * 409 del backend sigue siendo la última palabra. Cerrar por falta de dato
 * dejaría la venta caída por un problema de red.
 *
 * Los canales manuales no usan esto para decidir si se ofrecen: ahí el criterio
 * es el opuesto (fail-closed contra los requisitos ya resueltos), porque
 * mostrarlos de más produce el flash-y-409 que la pantalla evita.
 */
export function channelOpen(availability, concept, channel) {
  return availability?.paymentChannels?.[concept]?.[channel] !== false
}

/** ¿Queda algún medio para este concepto? */
export function hasOpenChannel(availability, concept) {
  return PAYMENT_CHANNELS.some((channel) => channelOpen(availability, concept, channel))
}
