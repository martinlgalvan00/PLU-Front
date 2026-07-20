import { PRICING } from './constants.js'

import { getEnabledTicketAddons, normalizeTicketAddons } from './ticketAddons.js'

/** Precios por defecto cuando un evento no tiene overrides en admin. */
export const DEFAULT_EVENT_PRICING = {
  membership: PRICING.membership,
  registration: PRICING.event,
  combo: PRICING.combo,
  ticketsEnabled: true,
  ticketAddons: [],
}

/** Un evento sin días configurados todavía no puede vender entradas. */
export const DEFAULT_EVENT_DAYS = []
export const DEFAULT_TICKET_TYPES = []

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
  const catalog = getEnabledTicketAddons(pricing.ticketAddons)
  const eventDays = [...(event?.eventDays ?? [])].sort((a, b) => a.dayIndex - b.dayIndex)
  const ticketTypes = (event?.ticketTypes ?? [])
    .filter((type) => type.active !== false)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((type) => ({
      id: type.id,
      name: type.name,
      price: Number(type.price) || 0,
      quota: type.quota ?? null,
      dayIndexes: type.dayIndexes ?? [],
      includedAddonIds: type.includedAddonIds ?? [],
      includedAddons: catalog.filter((addon) => (type.includedAddonIds ?? []).includes(addon.id)),
    }))

  return { eventDays, ticketTypes, addons: catalog }
}

/** Precio del tipo de entrada más barato activo, o null si no hay ninguno. */
export function cheapestTicketTypePrice(pricing) {
  const prices = (pricing?.ticketTypes ?? []).map((type) => type.price)
  return prices.length ? Math.min(...prices) : null
}

export function normalizeEventPricingInput(pricing = {}) {
  return {
    membership: Number(pricing.membership) || DEFAULT_EVENT_PRICING.membership,
    registration: Number(pricing.registration) || DEFAULT_EVENT_PRICING.registration,
    combo: Number(pricing.combo) || DEFAULT_EVENT_PRICING.combo,
    ticketsEnabled: pricing.ticketsEnabled !== false,
    ticketAddons: normalizeTicketAddons(pricing.ticketAddons),
  }
}
