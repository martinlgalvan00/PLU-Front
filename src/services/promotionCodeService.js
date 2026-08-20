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

export const PENDING_PROMOTION_STORAGE_KEY = PENDING_PROMOTION_KEY
