import { PRICING } from './constants.js'

import { getEnabledTicketAddons, normalizeTicketAddons } from './ticketAddons.js'

/** Precios por defecto cuando un evento no tiene overrides en admin. */
export const DEFAULT_EVENT_PRICING = {
  membership: PRICING.membership,
  registration: PRICING.event,
  combo: PRICING.combo,
  ticketDay: PRICING.ticket,
  ticketBothDays: PRICING.ticketBothDays,
  ticketDayPresencial: PRICING.ticketPresencial,
  ticketBothDaysPresencial: PRICING.ticketBothDaysPresencial,
  ticketsEnabled: true,
  ticketAddons: [],
}

export function resolveEventPricing(event) {
  const pricing = {
    ...DEFAULT_EVENT_PRICING,
    ...(event?.pricing ?? {}),
  }
  return {
    ...pricing,
    ticketAddons: normalizeTicketAddons(pricing.ticketAddons),
  }
}

/** Formato esperado por ticketService y TicketPurchaseSection. */
export function ticketPricingFromEvent(event) {
  const pricing = resolveEventPricing(event)
  return {
    day: pricing.ticketDay,
    bothDays: pricing.ticketBothDays,
    dayPresencial: pricing.ticketDayPresencial,
    bothDaysPresencial: pricing.ticketBothDaysPresencial,
    addons: getEnabledTicketAddons(pricing.ticketAddons),
  }
}

export function normalizeEventPricingInput(pricing = {}) {
  return {
    membership: Number(pricing.membership) || DEFAULT_EVENT_PRICING.membership,
    registration: Number(pricing.registration) || DEFAULT_EVENT_PRICING.registration,
    combo: Number(pricing.combo) || DEFAULT_EVENT_PRICING.combo,
    ticketDay: Number(pricing.ticketDay) || DEFAULT_EVENT_PRICING.ticketDay,
    ticketBothDays: Number(pricing.ticketBothDays) || DEFAULT_EVENT_PRICING.ticketBothDays,
    ticketDayPresencial: Number(pricing.ticketDayPresencial) || DEFAULT_EVENT_PRICING.ticketDayPresencial,
    ticketBothDaysPresencial:
      Number(pricing.ticketBothDaysPresencial) || DEFAULT_EVENT_PRICING.ticketBothDaysPresencial,
    ticketsEnabled: pricing.ticketsEnabled !== false,
    ticketAddons: normalizeTicketAddons(pricing.ticketAddons),
  }
}
