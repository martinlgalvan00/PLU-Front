import { PRICING } from './constants.js'

import { getEnabledTicketAddons, normalizeTicketAddons } from './ticketAddons.js'

/** Precios por defecto cuando un evento no tiene overrides en admin. */
export const DEFAULT_EVENT_PRICING = {
  membership: PRICING.membership,
  registration: PRICING.event,
  combo: PRICING.combo,
  ticketsEnabled: false,
  ticketAddons: [],
}

/** Oferta combo vigente segun active + ventana startsAt/endsAt. */
export function isComboOfferLive(offer, now = new Date()) {
  if (!offer || offer.active !== true) return false
  const price = Number(offer.price)
  if (!Number.isFinite(price) || price <= 0) return false
  if (offer.startsAt && new Date(offer.startsAt).getTime() > now.getTime()) return false
  if (offer.endsAt && new Date(offer.endsAt).getTime() < now.getTime()) return false
  return true
}

export function resolveLiveComboOffer(event, now = new Date()) {
  const offer = event?.comboOffer ?? null
  return isComboOfferLive(offer, now) ? offer : null
}

function toPositiveAmount(value) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

/**
 * Lectura comercial del combo: suma por separado, ahorro y % de descuento.
 * El porcentaje se calcula para no mentir si Tarifas cambia los montos.
 */
export function resolveComboDeal({ membership, registration, combo } = {}) {
  const membershipPrice = toPositiveAmount(membership)
  const registrationPrice = toPositiveAmount(registration)
  const comboPrice = toPositiveAmount(combo)
  const separate = membershipPrice + registrationPrice
  if (!membershipPrice || !registrationPrice || !comboPrice || separate <= 0) {
    return {
      membership: membershipPrice,
      registration: registrationPrice,
      combo: comboPrice,
      separate,
      savings: 0,
      percent: 0,
      live: false,
    }
  }

  const savings = Math.max(0, separate - comboPrice)
  const percent = savings > 0 ? Math.round((savings / separate) * 100) : 0
  return {
    membership: membershipPrice,
    registration: registrationPrice,
    combo: comboPrice,
    separate,
    savings,
    percent,
    live: savings > 0 && comboPrice < separate,
  }
}

/** Un evento sin días configurados todavía no puede vender entradas. */
export const DEFAULT_EVENT_DAYS = []
export const DEFAULT_TICKET_TYPES = []

export function resolveEventPricing(event) {
  const liveCombo = resolveLiveComboOffer(event)
  const pricing = {
    ...DEFAULT_EVENT_PRICING,
    ...(event?.pricing ?? {}),
  }
  if (liveCombo) {
    pricing.combo = Number(liveCombo.price) || pricing.combo
  }
  if (event?.price != null && Number.isFinite(Number(event.price))) {
    pricing.registration = Number(event.price)
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

/**
 * Si la venta de entradas del evento está habilitada.
 * No depende de que el catálogo (días/tipos) ya tenga precio publicado:
 * la navegación a checkout se permite; el formulario decide si hay qué vender.
 */
export function isTicketSalesEnabled(event) {
  return resolveEventPricing(event).ticketsEnabled === true
}

export function normalizeEventPricingInput(pricing = {}) {
  const numberOrDefault = (value, fallback) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return {
    membership: numberOrDefault(pricing.membership, DEFAULT_EVENT_PRICING.membership),
    registration: numberOrDefault(pricing.registration, DEFAULT_EVENT_PRICING.registration),
    combo: numberOrDefault(pricing.combo, DEFAULT_EVENT_PRICING.combo),
    ticketsEnabled: pricing.ticketsEnabled === true,
    ticketAddons: normalizeTicketAddons(pricing.ticketAddons),
  }
}
