import { PRICING } from './constants.js'

import { getEnabledTicketAddons, normalizeTicketAddons } from './ticketAddons.js'
import { isStoredEventModuleOn } from '../../shared/eventModules.js'
import { summarizeTicketCredentials } from './ticketCredentials.js'

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
  pricing.wisePrice =
    event?.wisePrice != null && Number.isFinite(Number(event.wisePrice))
      ? Number(event.wisePrice)
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

/**
 * Ventana propia del tipo de entrada. `null` en cualquiera de los dos extremos
 * significa "hereda la del evento", así que sólo cierra antes, nunca reabre lo
 * que el evento ya cerró — la RPC evalúa las dos y la primera que corta gana.
 *
 * Devuelve por qué está cerrada, no sólo si lo está: la pantalla de compra
 * tiene que poder decir "abre el jueves" en vez de esconder el tipo sin
 * explicación.
 */
export function resolveTicketTypeSaleWindow(type, now = new Date()) {
  const opensAt = type?.salesOpensAt ? new Date(type.salesOpensAt) : null
  const closesAt = type?.salesClosesAt ? new Date(type.salesClosesAt) : null
  const time = now.getTime()
  if (opensAt && Number.isFinite(opensAt.getTime()) && time < opensAt.getTime()) {
    return {
      open: false,
      reason: 'upcoming',
      opensAt: type.salesOpensAt,
      closesAt: type.salesClosesAt ?? null,
    }
  }
  if (closesAt && Number.isFinite(closesAt.getTime()) && time > closesAt.getTime()) {
    return {
      open: false,
      reason: 'closed',
      opensAt: type?.salesOpensAt ?? null,
      closesAt: type.salesClosesAt,
    }
  }
  return {
    open: true,
    reason: null,
    opensAt: type?.salesOpensAt ?? null,
    closesAt: type?.salesClosesAt ?? null,
  }
}

/** Formato esperado por ticketService y TicketPurchaseSection. */
export function ticketPricingFromEvent(event, now = new Date()) {
  const pricing = resolveEventPricing(event)
  const enabledAddons = getEnabledTicketAddons(pricing.ticketAddons)
  // Módulo «Extras de entradas» apagado: no se venden extras aparte. Los que un
  // tipo de entrada trae incluidos siguen (son parte de esa entrada), así que
  // el catálogo se queda solo con esos. La ruta de órdenes rechaza el resto.
  const includedIds = new Set((event?.ticketTypes ?? []).flatMap((type) => type.includedAddonIds ?? []))
  const catalog = isStoredEventModuleOn(event, 'ticketAddons')
    ? enabledAddons
    : enabledAddons.filter((addon) => includedIds.has(addon.id))
  const eventDays = [...(event?.eventDays ?? [])].sort((a, b) => a.dayIndex - b.dayIndex)
  const ticketTypes = (event?.ticketTypes ?? [])
    .filter((type) => type.active !== false)
    // Un tipo fuera de su ventana no se oferta. Se filtra acá y no en la
    // pantalla para que ticketService cotice sobre lo mismo que se muestra.
    .filter((type) => resolveTicketTypeSaleWindow(type, now).open)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((type) => {
      // Subcategorías: qué credenciales emite una compra de este tipo y qué
      // zona abre cada una. Hasta acá se perdían en este map y el comprador
      // veía un nombre suelto: dos entradas distintas se leían iguales.
      const { credentials, count, zoneScopes } = summarizeTicketCredentials(type.credentials)
      return {
        id: type.id,
        name: type.name,
        description: type.description?.trim() ?? '',
        price: Number(type.price) || 0,
        // USD cargado a mano para Wise. Sin esto, el checkout convertía el
        // total en pesos y mostraba un número que el panel no decidió.
        wisePrice: Number.isFinite(Number(type.wisePrice)) ? Number(type.wisePrice) : null,
        // Precio para transferencia/efectivo. Null = cobra igual que `price`
        // en cualquier canal, que es el comportamiento de siempre.
        manualPrice:
          Number.isFinite(Number(type.manualPrice)) && Number(type.manualPrice) > 0
            ? Number(type.manualPrice)
            : null,
        salesOpensAt: type.salesOpensAt ?? null,
        salesClosesAt: type.salesClosesAt ?? null,
        // Medios propios de esta entrada (null = hereda los del evento). El
        // checkout lo cruza con lo que el evento ya dejaba abierto para no
        // ofrecer un medio que el tipo elegido rechaza con 409 al confirmar.
        paymentChannels: type.paymentChannels ?? null,
        quota: type.quota ?? null,
        dayIndexes: type.dayIndexes ?? [],
        accessDays: (type.dayIndexes ?? [])
          .map((dayIndex) => eventDays.find((day) => day.dayIndex === dayIndex))
          .filter(Boolean),
        includedAddonIds: type.includedAddonIds ?? [],
        includedAddons: catalog.filter((addon) => (type.includedAddonIds ?? []).includes(addon.id)),
        credentials,
        // Cuántos QR emite la compra. El cupo sigue contando compras: un
        // entrenador ocupa un lugar y recibe dos credenciales.
        credentialCount: count,
        zoneScopes,
      }
    })

  return { eventDays, ticketTypes, addons: catalog }
}

/**
 * Formato compacto para listas (matriz de accesos): sin el paréntesis que
 * muchos tipos copian de la descripción, y sin gritar si el panel cargó el
 * nombre en mayúsculas.
 */
export function shortTicketTypeName(name, locale = 'es') {
  const raw = String(name ?? '').trim()
  if (!raw) return ''
  const withoutNote = raw.replace(/\s*\([^()]*\)\s*$/u, '').trim() || raw
  const letters = withoutNote.replace(/[^\p{L}]/gu, '')
  if (!letters) return withoutNote
  const localeTag = locale === 'en' ? 'en-US' : 'es-AR'
  if (letters !== letters.toLocaleUpperCase(localeTag)) return withoutNote
  return withoutNote
    .toLocaleLowerCase(localeTag)
    .replace(/(^|[^\p{L}])(\p{L})/gu, (_, sep, letter) => sep + letter.toLocaleUpperCase(localeTag))
}

/**
 * Parte el nombre de un tipo de entrada en título y nota.
 *
 * Muchos tipos se cargan como "PÚBLICO GENERAL 1 DÍA (Incluye el ingreso ...)":
 * la descripción viaja pegada al nombre. En la vidriera eso convierte el título
 * en un párrafo de tres líneas. Acá se separa la nota entre paréntesis del
 * final para mostrarla como descripción secundaria; el dato en base no cambia.
 *
 * @returns {{ title: string, note: string }}
 */
export function ticketTypeNameParts(name, locale = 'es') {
  const raw = String(name ?? '').trim()
  const match = raw.match(/\s*\(([^()]*)\)\s*$/u)
  const inner = match ? match[1].trim() : ''
  const note = inner ? inner.charAt(0).toLocaleUpperCase(locale === 'en' ? 'en-US' : 'es-AR') + inner.slice(1) : ''
  return { title: shortTicketTypeName(raw, locale), note }
}

/** Precio del tipo de entrada más barato activo, o null si no hay ninguno. */
export function cheapestTicketTypePrice(pricing) {
  const prices = (pricing?.ticketTypes ?? []).map((type) => type.price)
  return prices.length ? Math.min(...prices) : null
}

/**
 * Estados terminales en los que la base rechaza cualquier compra de entradas
 * (PLU03). `cerrado` cierra la inscripción de atletas, no la venta al público:
 * esta última tiene su propio interruptor y ventana.
 */
export const TICKET_SALES_CLOSED_STATUSES = Object.freeze(['finalizado'])

/**
 * ¿El estado del evento cierra la venta de entradas? Mismo corte que las RPC de
 * venta. Lee el estado guardado (`storedStatus` cuando la pantalla ya lo
 * reemplazó por el público): que venza la ventana de inscripción de atletas no
 * corta las entradas, la base las sigue vendiendo.
 */
export function eventStatusClosesTicketSales(event) {
  return TICKET_SALES_CLOSED_STATUSES.includes(event?.storedStatus ?? event?.status)
}

/**
 * Si la venta de entradas del evento está habilitada: interruptor del evento y
 * estado que la permite. La inscripción cerrada no modifica esta decisión.
 * No depende de que el catálogo (días/tipos) ya tenga precio publicado:
 * la navegación a checkout se permite; el formulario decide si hay qué vender.
 */
export function isTicketSalesEnabled(event) {
  return resolveEventPricing(event).ticketsEnabled === true && !eventStatusClosesTicketSales(event)
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
