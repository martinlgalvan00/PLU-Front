import { effectiveEventChannelsFor } from './eventPaymentChannels.js'
import { platformCellsFor } from './platformPaymentChannels.js'

/**
 * Avisos de cobro antes de publicar un evento — PLU ARG
 *
 * Publicar es lo que ve el público. Un evento puede quedar publicado sin
 * ningún medio de pago abierto, o con la transferencia abierta y sin destino
 * de cobro, y el problema recién aparece cuando alguien intenta pagar: el 409
 * llega con los datos ya cargados. Esto lo dice antes.
 *
 * Son avisos y no bloqueos a propósito: hay eventos que se publican sin cobro
 * (un seminario gratuito, una fecha que se anuncia antes de abrir ventas) y el
 * panel no puede saberlo. La decisión es de quien publica; acá se le dice lo
 * que va a pasar.
 *
 * Acepta tanto un draft del editor como una fila de la lista: sólo lee
 * `paymentChannelOverrides`, `bankTransfer*`, `pricing.ticketsEnabled` y
 * `ticketTypes`.
 *
 * @param {object} event
 * @param {object|null} [platform] toggles de plataforma (`fetchPlatformFeatureToggles`)
 * @returns {string[]} códigos, en orden de gravedad
 */
export function resolveEventPublishChecks(event, platform = null) {
  const checks = []
  if (!event) return checks

  const effective = (concept) =>
    effectiveEventChannelsFor(
      event.paymentChannelOverrides,
      concept,
      platformCellsFor(platform, concept),
    )
  const registration = effective('registration')
  const ticket = effective('ticket')
  const ticketsEnabled = event.pricing?.ticketsEnabled === true

  if (registration.length === 0) checks.push('noRegistrationChannel')
  if (ticketsEnabled && ticket.length === 0) checks.push('noTicketChannel')

  // Las entradas sólo cuentan si el evento las vende: con la venta apagada la
  // transferencia que hereda de la plataforma no se usa para nada.
  const transferOpen =
    registration.includes('bank_transfer') || (ticketsEnabled && ticket.includes('bank_transfer'))
  const hasDestination =
    Boolean(event.bankTransferProfileId) || Boolean(String(event.bankTransfer?.alias ?? '').trim())
  if (transferOpen && !hasDestination) checks.push('transferWithoutDestination')

  if (ticketsEnabled) {
    const sellable = (event.ticketTypes ?? []).filter(
      (type) => type.active !== false && Number(type.price) > 0,
    )
    if (sellable.length === 0) checks.push('noSellableTicketType')
  }

  return checks
}

/**
 * Resumen de cobro de un evento para la lista: qué medios tiene abiertos en
 * inscripción y, si vende entradas, en entradas.
 *
 * @returns {{registration: string[], ticket: string[]|null}}
 */
export function summarizeEventPaymentChannels(event, platform = null) {
  const effective = (concept) =>
    effectiveEventChannelsFor(
      event?.paymentChannelOverrides,
      concept,
      platformCellsFor(platform, concept),
    )
  return {
    registration: effective('registration'),
    ticket: event?.pricing?.ticketsEnabled === true ? effective('ticket') : null,
  }
}

