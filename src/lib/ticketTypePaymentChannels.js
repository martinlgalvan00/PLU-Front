/**
 * Medios de cobro de un tipo de entrada — PLU ARG
 *
 * Tercer eslabón de una cadena que ya existía en dos: la matriz de plataforma
 * (Finanzas) es el techo, el evento sólo puede cerrar debajo de ella
 * (`eventPaymentChannels.js`), y ahora el tipo de entrada sólo puede cerrar
 * debajo del evento. Ningún eslabón reabre lo que el de arriba cerró: si
 * Finanzas apagó el efectivo, una entrada que lo pide igual no lo consigue.
 *
 * El caso que lo pidió: un palco caro se cobra sólo por Mercado Pago —se
 * acredita solo, sin comprobante que aprobar a mano— mientras la general
 * sigue aceptando transferencia y efectivo. Antes la única forma era cerrar
 * el canal para TODAS las entradas del evento.
 *
 * `null` hereda el evento, que es lo que tienen todas las entradas ya
 * cargadas. La forma guardada (`ticket_types.payment_channels`) es la misma
 * que la del evento —`{canal: bool}`— así que las dos se leen igual.
 *
 * Vive en `lib/` y no en el servidor por el mismo motivo que su hermano: lo
 * comparten el panel, la pantalla pública y las rutas. Que cada lado
 * resolviera la intersección a su manera sería la forma silenciosa de
 * ofrecer un medio de pago que después rebota con 409 al confirmar.
 */

import { EVENT_PAYMENT_CHANNELS, openEventChannelsFor } from './eventPaymentChannels.js'

export const TICKET_TYPE_PAYMENT_CHANNELS = EVENT_PAYMENT_CHANNELS

/**
 * Banderas del tipo, o `null` si hereda el evento. No inventa: sin ningún
 * booleano conocido devuelve `null` en vez de un objeto vacío, que sería un
 * override que no dice nada.
 */
export function normalizeTicketTypePaymentChannels(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const flags = {}
  let any = false
  for (const channel of TICKET_TYPE_PAYMENT_CHANNELS) {
    if (typeof raw[channel] === 'boolean') {
      flags[channel] = raw[channel]
      any = true
    }
  }
  return any ? flags : null
}

/** ¿El tipo deja abierto este canal, mirando sólo su propio override? */
export function isTicketTypeChannelOpen(typeChannels, channel) {
  const flags = normalizeTicketTypePaymentChannels(typeChannels)
  if (!flags) return true
  return flags[channel] !== false
}

/**
 * Canales que quedan abiertos para comprar ESTE tipo de entrada, en orden
 * canónico: evento ∩ tipo. `platformChannels` es opcional y se aplica arriba
 * de todo cuando se conoce (la pantalla pública lo recibe del backend; el
 * panel puede no tenerlo todavía y evalúa lo que sí depende del evento).
 *
 * @param {object} input
 * @param {object|null} [input.eventOverrides] `events.payment_channel_overrides`
 * @param {object|null} [input.typeChannels] `ticket_types.payment_channels`
 * @param {object|null} [input.platformChannels] `{canal: bool}` de Finanzas
 * @returns {string[]}
 */
export function resolveTicketTypeChannels({
  eventOverrides = null,
  typeChannels = null,
  platformChannels = null,
} = {}) {
  return openEventChannelsFor(eventOverrides, 'ticket').filter((channel) => {
    if (!isTicketTypeChannelOpen(typeChannels, channel)) return false
    if (!platformChannels) return true
    return platformChannels[channel] === true
  })
}

/**
 * ¿Este tipo se puede comprar por algún lado? Es la pregunta que decide si
 * una entrada activa y con precio es realmente vendible: cerrar el último
 * canal la deja en catálogo pero fuera de la venta.
 */
export function ticketTypeHasOpenChannel(input) {
  return resolveTicketTypeChannels(input).length > 0
}

/**
 * Canales que el tipo cierra por su cuenta, entre los que el evento dejaba
 * abiertos. Es lo que el panel muestra como excepción ("sin efectivo"): un
 * canal que ya estaba cerrado a nivel evento no es una decisión de esta
 * entrada y no se cuenta.
 */
export function ticketTypeClosedChannels({ eventOverrides = null, typeChannels = null } = {}) {
  const flags = normalizeTicketTypePaymentChannels(typeChannels)
  if (!flags) return []
  return openEventChannelsFor(eventOverrides, 'ticket').filter((channel) => flags[channel] === false)
}

/**
 * Punto de partida al prender "medios propios" en un tipo: todo lo que el
 * evento deja abierto, abierto. Arrancar con algo cerrado sería cerrar una
 * venta por el solo hecho de haber tocado un interruptor — el mismo criterio
 * que `allOpenEventPaymentChannelOverrides`.
 */
export function allOpenTicketTypePaymentChannels(eventOverrides = null) {
  // Sólo los canales que el evento deja abiertos: guardar en `false` uno que
  // el evento ya cerró no cambia nada y ensucia la fila con una decisión que
  // no es de esta entrada.
  return Object.fromEntries(
    openEventChannelsFor(eventOverrides, 'ticket').map((channel) => [channel, true]),
  )
}
