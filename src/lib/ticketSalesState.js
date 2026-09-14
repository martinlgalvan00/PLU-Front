/**
 * Por qué la venta de entradas de un evento está abierta o cerrada — PLU ARG
 *
 * La venta pasa por seis controles que viven en cuatro lugares distintos: una
 * variable de entorno, dos interruptores de plataforma (Finanzas), el switch
 * del evento con su ventana, el catálogo de tipos con la suya, y la matriz de
 * medios de pago. Cada uno tiene su motivo para existir, pero juntos son un
 * "no se vende y nadie sabe por qué": el operador prende el switch del evento,
 * no pasa nada, y el que corta está dos pantallas más allá.
 *
 * Esto no agrega un control más. Lee los que ya existen y devuelve el motivo,
 * en el mismo orden en que efectivamente cortan, para que el panel pueda decir
 * dónde se arregla en vez de mostrar un interruptor en ON sin efecto.
 *
 * `platform` es opcional: sin él se evalúa lo que depende del evento y el
 * catálogo, que es lo que el editor puede arreglar solo.
 */

import { isEventChannelOpenForConcept } from './eventPaymentChannels.js'
import { resolveTicketTypeSaleWindow } from './eventPricing.js'

/** Estados del evento en los que la base rechaza cualquier compra. */
const CLOSED_EVENT_STATUSES = ['cerrado', 'finalizado']

export const TICKET_SALES_CHANNELS = [
  'mercado_pago',
  'bank_transfer',
  'cash_pitbull',
  'wise_transfer',
]

/**
 * Dónde se arregla cada bloqueo. Lo usa el panel para mandar al lugar correcto
 * en vez de dejar al operador buscando.
 */
export const TICKET_SALES_BLOCKER_SCOPES = {
  environmentHold: 'environment',
  platformCheckout: 'platform',
  platformTicket: 'platform',
  noChannel: 'platform',
  eventDisabled: 'event',
  unpublished: 'event',
  eventStatus: 'event',
  windowUpcoming: 'event',
  windowClosed: 'event',
  noDays: 'catalog',
  noSellableType: 'catalog',
  noTypeInWindow: 'catalog',
}

function parseLocal(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

/**
 * @param {object} input
 * @param {object} input.event Draft o evento ya mapeado.
 * @param {object|null} [input.platform] Respuesta de `fetchPlatformFeatureToggles`.
 * @param {Date} [input.now]
 * @returns {{open: boolean, blockers: Array<{code: string, scope: string, detail?: string}>,
 *   openChannels: string[], sellableTypes: number, typesInWindow: number}}
 */
export function resolveTicketSalesState({ event, platform = null, now = new Date() } = {}) {
  const blockers = []
  const add = (code, detail) =>
    blockers.push({ code, scope: TICKET_SALES_BLOCKER_SCOPES[code] ?? 'event', detail })

  // 1. Entorno. Está por encima del panel: mientras siga puesto, ningún
  //    interruptor de abajo tiene efecto.
  const holds = Array.isArray(platform?.environmentHolds) ? platform.environmentHolds : []
  const hold = holds.find((entry) => entry?.scope === 'ticket' || entry?.scope === 'checkout')
  if (hold) add('environmentHold', hold.variable)

  // 2. Plataforma (Finanzas → Acceso y habilitación).
  if (platform && platform.checkoutEnabled === false) add('platformCheckout')
  if (platform && platform.ticketEnabled === false) add('platformTicket')

  // 3. Evento.
  if (event?.pricing?.ticketsEnabled !== true) add('eventDisabled')
  if (event?.published !== true) add('unpublished')
  if (CLOSED_EVENT_STATUSES.includes(event?.status)) add('eventStatus', event.status)

  const opensAt = parseLocal(event?.ticketSalesOpensAt)
  const closesAt = parseLocal(event?.ticketSalesClosesAt)
  if (opensAt && now.getTime() < opensAt.getTime()) add('windowUpcoming', event.ticketSalesOpensAt)
  if (closesAt && now.getTime() > closesAt.getTime()) add('windowClosed', event.ticketSalesClosesAt)

  // 4. Catálogo. Un tipo sin precio no se puede vender y uno fuera de su
  //    ventana no se ofrece: se cuentan por separado para poder distinguir
  //    "no hay entradas cargadas" de "las que hay todavía no abrieron".
  const types = event?.ticketTypes ?? []
  const sellable = types.filter((type) => type.active !== false && Number(type.price) > 0)
  const inWindow = sellable.filter((type) => resolveTicketTypeSaleWindow(type, now).open)

  if (!(event?.eventDays ?? []).length) add('noDays')
  if (sellable.length === 0) add('noSellableType')
  else if (inWindow.length === 0) add('noTypeInWindow')

  // 5. Medios de pago. La plataforma es el techo y el evento sólo cierra: sin
  //    ninguno abierto la compra rebota con 409 al confirmar, no antes.
  const openChannels = TICKET_SALES_CHANNELS.filter((channel) => {
    const platformOpen = platform ? platform.paymentChannels?.ticket?.[channel] === true : true
    return platformOpen && isEventChannelOpenForConcept(event?.paymentChannelOverrides, 'ticket', channel)
  })
  if (openChannels.length === 0) add('noChannel')

  return {
    open: blockers.length === 0,
    blockers,
    openChannels,
    sellableTypes: sellable.length,
    typesInWindow: inWindow.length,
  }
}
