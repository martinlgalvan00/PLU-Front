import { PRICING } from './constants.js'

/** Precios por defecto cuando un evento no tiene overrides en admin. */
export const DEFAULT_EVENT_PRICING = {
  membership: PRICING.membership,
  registration: PRICING.event,
  combo: PRICING.combo,
  ticketDay: PRICING.ticket,
  ticketBothDays: PRICING.ticketBothDays,
  ticketsEnabled: true,
}

export function resolveEventPricing(event) {
  return {
    ...DEFAULT_EVENT_PRICING,
    ...(event?.pricing ?? {}),
  }
}

/** Formato esperado por ticketService y TicketPurchaseSection. */
export function ticketPricingFromEvent(event) {
  const pricing = resolveEventPricing(event)
  return {
    day: pricing.ticketDay,
    bothDays: pricing.ticketBothDays,
  }
}

export function normalizeEventPricingInput(pricing = {}) {
  return {
    membership: Number(pricing.membership) || DEFAULT_EVENT_PRICING.membership,
    registration: Number(pricing.registration) || DEFAULT_EVENT_PRICING.registration,
    combo: Number(pricing.combo) || DEFAULT_EVENT_PRICING.combo,
    ticketDay: Number(pricing.ticketDay) || DEFAULT_EVENT_PRICING.ticketDay,
    ticketBothDays: Number(pricing.ticketBothDays) || DEFAULT_EVENT_PRICING.ticketBothDays,
    ticketsEnabled: pricing.ticketsEnabled !== false,
  }
}
