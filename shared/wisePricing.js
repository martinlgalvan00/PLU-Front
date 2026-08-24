const DEFAULT_BLUE_RATE_ARS = 1550
const DEFAULT_ROUNDING_STEP_USD = 5

const PLACEHOLDER_PATTERN = /^(?:replace|changeme|placeholder|your[_-]|xxx|test-x{4}$)/i

export function configuredNumber(value) {
  const raw = String(value ?? '').trim()
  if (!raw || PLACEHOLDER_PATTERN.test(raw)) return null
  const parsed = Number(raw.replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function wiseExchangeRate(env = {}) {
  return (
    configuredNumber(env.WISE_BLUE_RATE_ARS) ??
    configuredNumber(env.VITE_WISE_BLUE_RATE_ARS) ??
    DEFAULT_BLUE_RATE_ARS
  )
}

export function wiseRoundingStep(env = {}) {
  const configured =
    configuredNumber(env.WISE_ROUNDING_STEP_USD) ??
    configuredNumber(env.VITE_WISE_ROUNDING_STEP_USD)
  return configured ? Math.max(1, Math.trunc(configured)) : DEFAULT_ROUNDING_STEP_USD
}

export function roundWiseUsd(amountUsd, step = DEFAULT_ROUNDING_STEP_USD) {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return 0
  return Math.ceil(amountUsd / step) * step
}

export function arsToWiseUsd(amountArs, env = {}) {
  const ars = Number(amountArs)
  if (!Number.isFinite(ars) || ars <= 0) return 0
  return roundWiseUsd(ars / wiseExchangeRate(env), wiseRoundingStep(env))
}
