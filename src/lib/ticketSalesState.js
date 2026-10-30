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

import { env } from '../config/env.js'
import { applyEventChannelOpens, isEventChannelOpenForConcept } from './eventPaymentChannels.js'
import { resolveTicketTypeChannels } from './ticketTypePaymentChannels.js'
import {
  eventStatusClosesTicketSales,
  resolveEventPricing,
  resolveTicketTypeSaleWindow,
  TICKET_SALES_CLOSED_STATUSES,
} from './eventPricing.js'

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
  noTypeWithChannel: 'catalog',
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
 *   openChannels: string[], sellableTypes: number, typesInWindow: number,
 *   typesWithChannel: number}}
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
  if (TICKET_SALES_CLOSED_STATUSES.includes(event?.status)) add('eventStatus', event.status)

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

  // 5. Medios de pago. La plataforma es el valor por defecto y el evento puede
  //    abrir o cerrar cada celda: sin ninguno abierto la compra rebota con 409
  //    al confirmar, no antes.
  const effectivePlatform = applyEventChannelOpens(platform, event?.paymentChannelOverrides)
  const openChannels = TICKET_SALES_CHANNELS.filter((channel) => {
    const platformOpen = effectivePlatform
      ? effectivePlatform.paymentChannels?.ticket?.[channel] === true
      : true
    return platformOpen && isEventChannelOpenForConcept(event?.paymentChannelOverrides, 'ticket', channel)
  })
  if (openChannels.length === 0) add('noChannel')

  // 6. Y el mismo corte, una vez por tipo: una entrada que cerró los medios
  //    que le quedaban sigue activa, en precio y en ventana, pero no se puede
  //    comprar. Con todas así la venta está cerrada aunque el evento tenga
  //    canales abiertos.
  const typesWithChannel = inWindow.filter(
    (type) =>
      resolveTicketTypeChannels({
        eventOverrides: event?.paymentChannelOverrides,
        typeChannels: type.paymentChannels,
        platformChannels: effectivePlatform ? effectivePlatform.paymentChannels?.ticket : null,
      }).length > 0,
  )
  if (openChannels.length > 0 && inWindow.length > 0 && typesWithChannel.length === 0) {
    add('noTypeWithChannel')
  }

  return {
    open: blockers.length === 0,
    blockers,
    openChannels,
    sellableTypes: sellable.length,
    typesInWindow: inWindow.length,
    typesWithChannel: typesWithChannel.length,
  }
}

/**
 * Motivo público de un corte que no es el interruptor del evento. El de
 * "deshabilitadas" queda solo para `off`.
 */
const PUBLIC_BLOCK_REASON = {
  environmentHold: 'environment',
  platformCheckout: 'platform',
  platformTicket: 'platform',
  noChannel: 'channels',
  unpublished: 'eventDisabled',
  eventStatus: 'eventStatus',
  windowUpcoming: 'window',
  windowClosed: 'windowClosed',
  noDays: 'noDays',
  noSellableType: 'noPrice',
  noTypeInWindow: 'window',
  noTypeWithChannel: 'channels',
}

const TICKET_OFFER_COPY = {
  eventDisabled: 'pages.ticketOffer.off',
  eventStatus: 'pages.ticketOffer.salesClosed',
  noPrice: 'pages.ticketOffer.noPrice',
  noDays: 'pages.ticketOffer.noDays',
  window: 'pages.ticketOffer.window',
  windowClosed: 'pages.ticketOffer.windowClosed',
  platform: 'pages.ticketOffer.platform',
  channels: 'pages.ticketOffer.channels',
  environment: 'pages.ticketOffer.environment',
}

/** Clave i18n del motivo. `null` cuando no hay que anunciar un corte. */
export function ticketOfferCopyKey(offer) {
  if (!offer || offer.status === 'open' || offer.status === 'pending') return null
  return TICKET_OFFER_COPY[offer.reason] ?? TICKET_OFFER_COPY.eventDisabled
}

function blockReason(code) {
  return PUBLIC_BLOCK_REASON[code] ?? 'platform'
}

/** Si ningún tipo está en ventana, distingue "todavía no abrió" de "ya cerró". */
function typeWindowReason(event, now) {
  const sellable = (event?.ticketTypes ?? []).filter(
    (type) => type.active !== false && Number(type.price) > 0,
  )
  const upcoming = sellable.some(
    (type) => resolveTicketTypeSaleWindow(type, now).reason === 'upcoming',
  )
  return upcoming ? 'window' : 'windowClosed'
}

/**
 * Oferta pública de entradas. Una sola decisión para el calendario, la página
 * de compra, la tienda y la landing.
 *
 * `off`: el interruptor del evento está apagado, el evento finalizó, o el
 * checkout en vivo ya dijo `eventTicketsEnabled: false`.
 * `open`: el interruptor está prendido y hay precio, ventana y un medio.
 * `blocked`: el interruptor está prendido, pero otro corte impide comprar.
 * `pending`: todavía no llegó el catálogo ni el vivo; no se afirma que esté
 * deshabilitada.
 *
 * El vivo gana al objeto en memoria: `true` abre el interruptor aunque el
 * seed diga `false`, y `false` lo cierra aunque el catálogo diga `true`.
 * `ticketEnabled: true` atrasado no reabre un interruptor que el vivo ya
 * marcó en false.
 *
 * @param {object} input
 * @param {object|null} [input.event]
 * @param {{ eventTicketsEnabled?: boolean|null, ticketEnabled?: boolean, channels?: object }|null} [input.live]
 * @param {{ ticketSalesEnabled?: boolean }} [input.config]
 * @param {Date} [input.now]
 * @param {boolean} [input.catalogSettled]
 * @param {boolean} [input.checkoutOpen]
 * @returns {{ status: 'off'|'open'|'blocked'|'pending', reason: string|null, canBuy: boolean }}
 */
export function resolvePublicTicketOffer({
  event = null,
  live = null,
  config = env,
  now = new Date(),
  catalogSettled = true,
  checkoutOpen = true,
} = {}) {
  if (!event) return { status: 'off', reason: 'eventDisabled', canBuy: false }
  if (eventStatusClosesTicketSales(event)) {
    return { status: 'off', reason: 'eventStatus', canBuy: false }
  }

  const liveSwitch = live?.eventTicketsEnabled
  let switchOn
  if (liveSwitch === false) switchOn = false
  else if (liveSwitch === true) switchOn = true
  else if (catalogSettled === false) return { status: 'pending', reason: null, canBuy: false }
  else switchOn = resolveEventPricing(event).ticketsEnabled === true

  if (!switchOn) return { status: 'off', reason: 'eventDisabled', canBuy: false }

  if (config?.ticketSalesEnabled === false) {
    return { status: 'blocked', reason: 'environment', canBuy: false }
  }
  if (checkoutOpen === false) return { status: 'blocked', reason: 'platform', canBuy: false }

  // El interruptor ya se resolvió arriba. Acá solo importan ventana, precio
  // y medios: se le pasa prendido para que este corte no lo vuelva a opinar.
  const state = resolveTicketSalesState({
    event: {
      ...event,
      published: event.published !== false,
      status: event.storedStatus ?? event.status,
      pricing: { ...(event.pricing ?? {}), ticketsEnabled: true },
    },
    platform: null,
    now,
  })
  const blocker = state.blockers.find((item) => item.code !== 'eventDisabled')
  if (blocker) {
    const reason =
      blocker.code === 'noTypeInWindow' ? typeWindowReason(event, now) : blockReason(blocker.code)
    if (reason === 'eventDisabled' || reason === 'eventStatus') {
      return { status: 'off', reason, canBuy: false }
    }
    return { status: 'blocked', reason, canBuy: false }
  }

  // El vivo ya confirmó el interruptor y aun así no deja cobrar: plataforma
  // o canales. Un `ticketEnabled: true` de una respuesta vieja no llega acá
  // si `eventTicketsEnabled` ya cerró arriba.
  if (live?.ticketEnabled === false) {
    const channels = live.channels
    const noneOpen =
      channels &&
      typeof channels === 'object' &&
      !Object.values(channels).some((open) => open === true)
    return { status: 'blocked', reason: noneOpen ? 'channels' : 'platform', canBuy: false }
  }

  return { status: 'open', reason: null, canBuy: true }
}
