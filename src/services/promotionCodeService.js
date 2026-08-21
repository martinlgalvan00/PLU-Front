import { redeemPromotionCodeRequest } from './athleteApi.js'

const PENDING_PROMOTION_KEY = 'plu:pending-promotion-code'
const CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/

export function normalizePromotionCode(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
}

export function buildPromotionCodeUrl(code, origin) {
  const normalized = normalizePromotionCode(code)
  const base =
    origin ?? (typeof window !== 'undefined' ? window.location.origin : 'https://pluarg.com')
  return `${String(base).replace(/\/$/, '')}/canjear/${encodeURIComponent(normalized)}`
}

export function matchPromotionCodeRoute(pathname = globalThis.location?.pathname ?? '') {
  const match = String(pathname).match(/^\/canjear\/([^/]+)\/?$/i)
  if (!match) return null
  try {
    const code = normalizePromotionCode(decodeURIComponent(match[1]))
    return CODE_PATTERN.test(code) ? { code } : null
  } catch {
    return null
  }
}

/**
 * El QR que se descarga desde Precios codifica la URL `/canjear/:code`
 * (`buildPromotionCodeUrl`), no el código pelado — así también sirve para
 * cualquier lector de QR ajeno a la app. Un escaneo dentro de la app puede
 * traer esa URL completa o, si alguien pega el texto de otro QR, el código
 * suelto: se soportan las dos formas.
 */
export function extractPromotionCodeFromScan(rawValue) {
  const value = String(rawValue ?? '').trim()
  if (!value) return null
  try {
    const url = new URL(value)
    const matched = matchPromotionCodeRoute(url.pathname)
    if (matched) return matched.code
  } catch {
    // No es una URL absoluta — puede ser el código pelado.
  }
  const normalized = normalizePromotionCode(value)
  return CODE_PATTERN.test(normalized) ? normalized : null
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
