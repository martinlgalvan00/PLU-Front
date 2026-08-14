import { HttpError } from './errors.js'

export const FEATURE_COMING_SOON = 'FEATURE_COMING_SOON'

/** Capacidades públicas. No dependen del entorno de despliegue. */
export const FEATURE_KEYS = Object.freeze({
  recurringMembership: 'recurringMembership',
  pricingWrites: 'pricingWrites',
  comboCheckout: 'comboCheckout',
  paidCheckout: 'paidCheckout',
})

export function isEnabledFlag(value) {
  return ['true', '1', 'yes'].includes(String(value ?? '').trim().toLowerCase())
}

function isDisabledFlag(value) {
  return ['false', '0', 'no'].includes(String(value ?? '').trim().toLowerCase())
}

/** `false` pausa los cobros; sin valor, el sitio público queda abierto. */
export function resolvePaidCheckoutOverride(env = process.env) {
  const raw = env?.PAID_CHECKOUT_ENABLED ?? env?.paidCheckoutEnabled
  if (typeof raw === 'boolean') return raw
  if (raw === undefined || raw === null || String(raw).trim() === '') return null
  if (isEnabledFlag(raw)) return true
  if (isDisabledFlag(raw)) return false
  return null
}

export function resolvePaymentsMockFlag(env = process.env) {
  const raw = env?.PAYMENTS_MOCK ?? env?.paymentsMock
  if (typeof raw === 'boolean') return raw
  if (raw === undefined || raw === null || String(raw).trim() === '') return null
  if (isEnabledFlag(raw)) return true
  if (isDisabledFlag(raw)) return false
  return null
}

export function isPaidCheckoutEnabled(env = process.env) {
  return resolvePaidCheckoutOverride(env) !== false
}

export function isFeatureEnabled(featureKey, env = process.env) {
  if ([FEATURE_KEYS.paidCheckout, FEATURE_KEYS.comboCheckout].includes(featureKey)) {
    return isPaidCheckoutEnabled(env)
  }
  return true
}

export function getFeatureAvailability(featureKey, env = process.env) {
  const enabled = isFeatureEnabled(featureKey, env)
  return { enabled, reason: enabled ? null : 'checkout_paused' }
}

export function isRecurringMembershipPlan(plan) {
  return (plan?.collection_mode ?? plan?.collectionMode) === 'recurring'
}

export function filterPublicMembershipPlans(plans) {
  return Array.isArray(plans) ? plans : []
}

export async function assertPaidCheckoutAvailable(env = process.env) {
  if (isPaidCheckoutEnabled(env)) return
  throw new HttpError(409, 'Los pagos están pausados temporalmente.', { code: FEATURE_COMING_SOON })
}

export async function assertComboCheckoutAvailable(env = process.env) {
  await assertPaidCheckoutAvailable(env)
}

export function assertRecurringMembershipAvailable() {}
export function assertPricingWritesEnabled() {}
