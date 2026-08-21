import { redeemPromotionCodeRequest } from './athleteApi.js'
import { resolveOfferChannels } from './exclusiveOfferService.js'

const PENDING_PROMOTION_KEY = 'plu:pending-promotion-code'
const CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/

export function normalizePromotionCode(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
}

/**
 * Lo que trae un escaneo, normalizado al código.
 *
 * No hay página pública de canje: el código se canjea únicamente dentro del
 * checkout de Afiliación o de Inscripción, así que el QR que reparte Precios
 * codifica el **código pelado** y se lee con el botón de escaneo de esos
 * campos. Un QR con URL no abriría nada.
 *
 * Se sigue tolerando una URL por los QR que ya se repartieron cuando existía
 * `/canjear/:code`: se toma su último segmento. El escaneo pasa igual por el
 * resolvedor del servidor, así que reconocer el texto no da ningún privilegio.
 */
export function extractPromotionCodeFromScan(rawValue) {
  const value = String(rawValue ?? '').trim()
  if (!value) return null
  const candidates = [value]
  try {
    const url = new URL(value)
    const lastSegment = url.pathname.split('/').filter(Boolean).at(-1)
    if (lastSegment) candidates.push(decodeURIComponent(lastSegment))
  } catch {
    // No es una URL absoluta — es el código pelado, el caso normal.
  }
  for (const candidate of candidates) {
    const normalized = normalizePromotionCode(candidate)
    if (CODE_PATTERN.test(normalized)) return normalized
  }
  return null
}

export function savePendingPromotionCode(code, context = {}) {
  const normalized = normalizePromotionCode(code)
  if (!CODE_PATTERN.test(normalized) || typeof sessionStorage === 'undefined') return false
  sessionStorage.setItem(
    PENDING_PROMOTION_KEY,
    JSON.stringify({ code: normalized, context, savedAt: new Date().toISOString() }),
  )
  return true
}

export function readPendingPromotionCode() {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const pending = JSON.parse(sessionStorage.getItem(PENDING_PROMOTION_KEY) ?? 'null')
    const code = normalizePromotionCode(pending?.code)
    return CODE_PATTERN.test(code) ? { ...pending, code } : null
  } catch {
    return null
  }
}

export function clearPendingPromotionCode() {
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(PENDING_PROMOTION_KEY)
}

export async function redeemPromotionCode(
  value,
  context = {},
  { redeem = redeemPromotionCodeRequest } = {},
) {
  const code = normalizePromotionCode(value)
  if (!CODE_PATTERN.test(code))
    return { accepted: false, status: 'rejected', reason: 'not_found', code }
  return redeem({ code, context })
}

export function promotionDestination(result) {
  if (!result?.accepted) return null
  if (result.action === 'open_exclusive_offer') {
    return { view: 'profile', options: { tab: 'account-offer' } }
  }
  const destination = result.destination ?? {}
  if (destination.view === 'profile') {
    return { view: 'profile', options: { tab: destination.tab } }
  }
  if (destination.view === 'competition') {
    return { view: 'competition', options: { eventSlug: destination.eventSlug } }
  }
  return null
}

/**
 * Traduce la respuesta del resolvedor a una descripción presentacional estable.
 * La UI no vuelve a inferir el contrato económico desde nombres de campaña:
 * usa los campos autoritativos que devolvió el servidor.
 */
export function promotionBenefitPresentation(result) {
  const percentOff = Number(result?.benefit?.percentOff)
  if (Number.isFinite(percentOff) && percentOff > 0) {
    return { type: 'percent', percent: percentOff }
  }
  if (['fixed_price'].includes(result?.kind)) return { type: 'fixedPrice' }
  if (result?.kind === 'offer' || result?.campaign?.objective === 'exclusive_offer') {
    return { type: 'exclusiveOffer' }
  }
  if (result?.kind === 'access' || result?.campaign?.objective === 'access') {
    return { type: 'access' }
  }
  return { type: 'discount' }
}

/**
 * Con qué se paga lo que se acaba de canjear, y si el pago se puede delegar.
 *
 * El canje devolvía el beneficio y callaba el medio: el atleta descubría que su
 * código sólo se cobra en efectivo —o que puede avisar el pago y quedar
 * habilitado— recién dentro del checkout, dos pantallas después. La matriz de
 * canales del código viaja en `benefit` (20260912100000) y es el mismo objeto
 * que interpreta la ficha secreta, así que se reusa su resolvedor en vez de
 * repetir el orden de lectura de los canales.
 *
 * `financed` se cruza contra los canales manuales a propósito: delegar existe
 * sobre transferencia o efectivo, nunca sobre la pasarela, que acredita sola.
 */
export function promotionPaymentPresentation(result) {
  if (!result?.accepted) return null
  const benefit = result.benefit ?? {}
  const manual = Array.isArray(benefit.manualChannels) ? benefit.manualChannels : []
  const channels = resolveOfferChannels(benefit)
  if (!channels.length) return null
  return {
    channels,
    financed: benefit.financed === true && manual.length > 0,
    // Un código que cerró la pasarela cambia la operación: no es "además
    // podés", es "sólo así".
    gatewayClosed: benefit.mercadoPagoEnabled === false,
  }
}

export function promotionDestinationType(result) {
  const destination = promotionDestination(result)
  if (!destination) return null
  if (destination.view === 'profile' && destination.options?.tab === 'account-membership') {
    return 'membership'
  }
  if (destination.view === 'competition') return 'registration'
  if (destination.view === 'profile' && destination.options?.tab === 'account-offer') {
    return 'exclusiveOffer'
  }
  return 'checkout'
}

export const PENDING_PROMOTION_STORAGE_KEY = PENDING_PROMOTION_KEY
