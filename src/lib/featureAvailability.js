import { env as appEnv } from '../config/env.js'

export const FEATURE_KEYS = Object.freeze({
  recurringMembership: 'recurringMembership',
  pricingWrites: 'pricingWrites',
  comboCheckout: 'comboCheckout',
  paidCheckout: 'paidCheckout',
})

function isEnabledFlag(value) {
  return ['true', '1', 'yes'].includes(String(value ?? '').trim().toLowerCase())
}

function isDisabledFlag(value) {
  return ['false', '0', 'no'].includes(String(value ?? '').trim().toLowerCase())
}

/** El checkout público está abierto salvo un cierre operativo explícito. */
export function resolvePaidCheckoutOverride(envLike = appEnv) {
  const raw = envLike?.paidCheckoutEnabled ?? envLike?.PAID_CHECKOUT_ENABLED
  if (typeof raw === 'boolean') return raw
  if (raw === undefined || raw === null || String(raw).trim() === '') return null
  if (isEnabledFlag(raw)) return true
  if (isDisabledFlag(raw)) return false
  return null
}

export function resolvePaymentsMockFlag(envLike = appEnv) {
  if (typeof envLike?.paymentsMock === 'boolean') return envLike.paymentsMock
  const raw = envLike?.PAYMENTS_MOCK
  if (typeof raw === 'boolean') return raw
  if (raw === undefined || raw === null || String(raw).trim() === '') return null
  if (isEnabledFlag(raw)) return true
  if (isDisabledFlag(raw)) return false
  return null
}

export function isPaidCheckoutEnabled(envLike = appEnv) {
  return resolvePaidCheckoutOverride(envLike) !== false
}

export function isFeatureEnabled(featureKey, envLike = appEnv) {
  if ([FEATURE_KEYS.paidCheckout, FEATURE_KEYS.comboCheckout].includes(featureKey)) {
    return isPaidCheckoutEnabled(envLike)
  }
  return true
}

export function getFeatureAvailability(featureKey, envLike = appEnv) {
  const enabled = isFeatureEnabled(featureKey, envLike)
  return { enabled, reason: enabled ? null : 'checkout_paused' }
}

export function isRecurringMembershipPlan(plan) {
  return (plan?.collection_mode ?? plan?.collectionMode) === 'recurring'
}

export function filterPublicMembershipPlans(plans) {
  return Array.isArray(plans) ? plans : []
}
