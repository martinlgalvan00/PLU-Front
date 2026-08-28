import { PRICING } from './constants.js'

import { getEnabledTicketAddons, normalizeTicketAddons } from './ticketAddons.js'

/** Precios por defecto cuando un evento no tiene overrides en admin. */
export const DEFAULT_EVENT_PRICING = {
  membership: PRICING.membership,
  registration: PRICING.event,
  // Precio por transferencia/efectivo. null = cobra igual que `registration`.
  registrationManual: null,
  // El combo promocional se retiró: el default es la suma de lista, que deja
  // el "deal" en 0% de ahorro (resolveComboDeal → live: false) en vez de
  // compilar al bundle el precio de una oferta que ya no existe.
  combo: PRICING.membership + PRICING.event,
  ticketsEnabled: false,
  ticketAddons: [],
}

/** Oferta combo vigente segun active + ventana startsAt/endsAt. */
export function isComboOfferLive(offer, now = new Date()) {
  if (!offer || offer.active !== true) return false
  // Un combo archivado es historia contable (20260914100000): sigue con
  // `active = true` porque esa migración no lo toca, pero dejó de ofrecerse.
  // Sin este check, el fallback de `fetchPublishedEvents` a Supabase directo
  // -que no pasa por `sanitizePublicCatalogEvent`- lo volvía a anunciar.
  if (offer.archivedAt) return false
  const price = Number(offer.price)
  if (!Number.isFinite(price) || price <= 0) return false
  if (offer.startsAt && new Date(offer.startsAt).getTime() > now.getTime()) return false
  if (offer.endsAt && new Date(offer.endsAt).getTime() < now.getTime()) return false
  return true
}

/**
 * Oferta que puede anunciarse en una superficie publica.
 *
 * Un combo con audiencia `code` puede estar vigente para el checkout despues
 * del canje, pero antes de eso no es parte del catalogo comercial visible.
 */
export function resolveLiveComboOffer(event, now = new Date(), { includeRestricted = false } = {}) {
  const offer = event?.comboOffer ?? null
  if (offer?.audience === 'private') return null
  if (!includeRestricted && offer?.audience === 'code') return null
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

/**
 * Cambio de precio de inscripción programado (20260929100000), leído desde el
 * catálogo público.
 *
 * Devuelve null si no hay cambio pendiente. Si la fecha ya pasó pero el
 * barrido del cron (corre cada minuto) todavía no volcó el precio, lo informa
 * con `live: true`: el que muestra precios debe usar el nuevo, no el viejo —
 * nunca anunciar un importe que el checkout ya no va a cobrar.
 */
export function resolveUpcomingPriceChange(event, now = new Date()) {
  const price = Number(event?.scheduledPrice)
  const effectiveAt = event?.priceEffectiveAt
  if (!effectiveAt || !Number.isFinite(price) || price <= 0) return null
  const effectiveTime = new Date(effectiveAt).getTime()
  if (!Number.isFinite(effectiveTime)) return null
  const manual = Number(event?.scheduledManualPrice)
  return {
    price,
    manualPrice: Number.isFinite(manual) && manual > 0 ? manual : null,
    effectiveAt,
    live: effectiveTime <= now.getTime(),
  }
}

export function resolveEventPricing(event, now = new Date()) {
  const liveCombo = resolveLiveComboOffer(event, now)
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
  pricing.registrationManual =
    event?.manualPrice != null && Number.isFinite(Number(event.manualPrice))
      ? Number(event.manualPrice)
      : null

  // Programación de precio: si todavía no llegó, viaja como `upcoming` para
  // que las superficies anuncien el aumento; si ya llegó (minuto de gracia
  // hasta que el barrido del cron escriba la columna), el precio vigente ES el
  // programado y no se anuncia nada.
  const upcoming = resolveUpcomingPriceChange(event, now)
  if (upcoming?.live) {
    pricing.registration = upcoming.price
    pricing.registrationManual = upcoming.manualPrice
    pricing.upcoming = null
  } else {
    pricing.upcoming = upcoming
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
  const registrationManual = Number(pricing.registrationManual)
  return {
    membership: numberOrDefault(pricing.membership, DEFAULT_EVENT_PRICING.membership),
    registration: numberOrDefault(pricing.registration, DEFAULT_EVENT_PRICING.registration),
    // undefined (no null): así el key se omite del body y el schema del
    // servidor (registrationManual: paidMoney.optional()) no intenta coercer
    // "sin precio manual" a 0.
    registrationManual:
      Number.isFinite(registrationManual) && registrationManual > 0
        ? registrationManual
        : undefined,
    combo: numberOrDefault(pricing.combo, DEFAULT_EVENT_PRICING.combo),
    ticketsEnabled: pricing.ticketsEnabled === true,
    ticketAddons: normalizeTicketAddons(pricing.ticketAddons),
  }
}
