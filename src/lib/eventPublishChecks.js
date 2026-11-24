import { effectiveEventChannelsFor } from './eventPaymentChannels.js'
import { platformCellsFor } from './platformPaymentChannels.js'
import { normalizeSalesIntent } from './eventSalesIntent.js'

/**
 * Avisos que el panel muestra en la ficha pero no peden confirmación al
 * publicar: son informativos (destino esperado), no un cobro incompleto.
 */
export const INFORMATIONAL_PUBLISH_CHECKS = new Set([
  'mpUsingPlatformDefault',
  'salesAnnounceMode',
  'cashWithoutVenue',
])

/**
 * Estado de conexión de un perfil MP sin depender del panel admin.
 * manual · connected · expiring · needs_reconnect
 */
function mpProfileConnectionStatus(profile, now = Date.now()) {
  if (profile?.connectionStatus) return profile.connectionStatus
  const config = profile?.config ?? {}
  if (config.connection !== 'oauth') return 'manual'
  if (config.status === 'needs_reconnect') return 'needs_reconnect'
  const expiresAt = config.expiresAt ? Date.parse(config.expiresAt) : NaN
  if (Number.isFinite(expiresAt)) {
    if (expiresAt <= now) return 'needs_reconnect'
    if (expiresAt - now <= 15 * 86_400_000) return 'expiring'
  }
  return 'connected'
}

/**
 * Destino de cobro MP a partir del readiness del servidor o del catálogo local.
 * @returns {{ destination: 'platform'|'profile'|'missing'|null, connectionStatus: string|null }}
 */
function resolveMpDestination(event, options = {}) {
  const readiness = event?.mercadoPagoReadiness
  if (readiness?.destination) {
    return {
      destination: readiness.destination,
      connectionStatus: readiness.connectionStatus ?? null,
    }
  }

  const profileId = event?.mercadoPagoProfileId ?? null
  if (!profileId) {
    return { destination: 'platform', connectionStatus: null }
  }

  const catalog = options.mpProfiles
  if (!Array.isArray(catalog)) {
    // Perfil elegido pero sin catálogo ni readiness: no inventamos avisos.
    return { destination: null, connectionStatus: null }
  }

  const found = catalog.find((profile) => profile.id === profileId)
  if (!found || found.active === false) {
    return { destination: 'missing', connectionStatus: null }
  }

  return {
    destination: 'profile',
    connectionStatus: mpProfileConnectionStatus(found),
  }
}

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
 * Acepta tanto un draft del editor como una fila de la lista: lee
 * `paymentChannelOverrides`, `bankTransfer*`, `mercadoPagoProfileId`,
 * `mercadoPagoReadiness` (si viene del API), `pricing.ticketsEnabled` y
 * `ticketTypes`.
 *
 * @param {object} event
 * @param {object|null} [platform] toggles de plataforma (`fetchPlatformFeatureToggles`)
 * @param {{ mpProfiles?: Array<{ id: string, active?: boolean, connectionStatus?: string, config?: object }> }} [options]
 * @returns {string[]} códigos, en orden de gravedad
 */
export function resolveEventPublishChecks(event, platform = null, options = {}) {
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
  const salesIntent = normalizeSalesIntent(event.salesIntent)

  // Solo anuncio: soft-launch sin exigir medios de inscripción. Si además
  // vende entradas, esas sí se validan (son cobro real).
  if (salesIntent === 'announce') {
    checks.push('salesAnnounceMode')
  } else if (registration.length === 0) {
    checks.push('noRegistrationChannel')
  }
  if (ticketsEnabled && ticket.length === 0) checks.push('noTicketChannel')

  // Destinos de cobro: en anuncio sin entradas no aplican (todavía no se cobra).
  const chargeRegistration = salesIntent !== 'announce'
  const transferOpen =
    (chargeRegistration && registration.includes('bank_transfer')) ||
    (ticketsEnabled && ticket.includes('bank_transfer'))
  const hasDestination =
    Boolean(event.bankTransferProfileId) || Boolean(String(event.bankTransfer?.alias ?? '').trim())
  if (transferOpen && !hasDestination) checks.push('transferWithoutDestination')

  const cashOpen =
    (chargeRegistration && registration.includes('cash_pitbull')) ||
    (ticketsEnabled && ticket.includes('cash_pitbull'))
  const hasCashPlace = Boolean(String(event.cashPayment?.place ?? '').trim())
  const hasVenue = Boolean(
    String(event.venue ?? '').trim() || String(event.location ?? '').trim(),
  )
  if (cashOpen && !hasCashPlace && !hasVenue) checks.push('cashWithoutVenue')

  const mpOpen =
    (chargeRegistration && registration.includes('mercado_pago')) ||
    (ticketsEnabled && ticket.includes('mercado_pago'))
  if (mpOpen) {
    const { destination, connectionStatus } = resolveMpDestination(event, options)
    if (destination === 'missing') checks.push('mpProfileMissing')
    else if (connectionStatus === 'needs_reconnect') checks.push('mpProfileNeedsReconnect')
    else if (destination === 'platform') checks.push('mpUsingPlatformDefault')
  }

  if (ticketsEnabled) {
    const sellable = (event.ticketTypes ?? []).filter(
      (type) => type.active !== false && Number(type.price) > 0,
    )
    if (sellable.length === 0) checks.push('noSellableTicketType')
  }

  return checks
}

/**
 * Subconjunto que sí pide «¿Publicar igual?»: omite avisos informativos
 * (p. ej. MP en cuenta general PLU, que es el destino por defecto).
 */
export function resolveEventPublishConfirmChecks(event, platform = null, options = {}) {
  return resolveEventPublishChecks(event, platform, options).filter(
    (code) => !INFORMATIONAL_PUBLISH_CHECKS.has(code),
  )
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
