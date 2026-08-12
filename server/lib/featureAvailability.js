import { HttpError } from './errors.js'
import {
  hasRegistrationOpensAtPassed,
  resolvePlatformRegistrationOpensAt,
} from './registrationSchedule.js'

export const FEATURE_COMING_SOON = 'FEATURE_COMING_SOON'

/** Catálogo mínimo de features gated por APP_PRODUCTION / PAID_CHECKOUT_ENABLED. */
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

export function isAppProduction(env = process.env) {
  return isEnabledFlag(env?.APP_PRODUCTION)
}

/**
 * Tri-state: true/false fuerza; null = sin override.
 * @param {NodeJS.ProcessEnv | Record<string, unknown>} [env]
 * @returns {boolean | null}
 */
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

/**
 * @deprecated Preferir fecha admin del evento. Se mantiene por compat de imports.
 * @param {NodeJS.ProcessEnv | Record<string, unknown>} [env]
 * @returns {string | null}
 */
export function resolvePaidCheckoutOpensAt(env = process.env) {
  const raw = env?.PAID_CHECKOUT_OPENS_AT ?? env?.paidCheckoutOpensAt
  const value = String(raw ?? '').trim()
  return value || null
}

/**
 * Sync: override + options.registrationOpensAt. Sin fecha, producción = cerrado.
 * @param {NodeJS.ProcessEnv | Record<string, unknown>} [env]
 * @param {Date} [now]
 * @param {{ registrationOpensAt?: string | null }} [options]
 */
export function isPaidCheckoutEnabled(env = process.env, now = new Date(), options = {}) {
  const override = resolvePaidCheckoutOverride(env)
  if (override !== null) return override

  if (isAppProduction(env) && resolvePaymentsMockFlag(env) === false) return false

  if (!isAppProduction(env)) return true

  const opensAt = options.registrationOpensAt ?? null
  if (opensAt) return hasRegistrationOpensAtPassed(opensAt, now)

  return false
}

/**
 * @param {keyof typeof FEATURE_KEYS | string} featureKey
 * @param {NodeJS.ProcessEnv | Record<string, unknown>} [env]
 * @param {Date} [now]
 * @param {{ registrationOpensAt?: string | null }} [options]
 */
export function isFeatureEnabled(featureKey, env = process.env, now = new Date(), options = {}) {
  const production = isAppProduction(env)
  switch (featureKey) {
    case FEATURE_KEYS.recurringMembership:
      return !production
    case FEATURE_KEYS.pricingWrites:
      return !production
    case FEATURE_KEYS.comboCheckout:
      return isPaidCheckoutEnabled(env, now, options)
    case FEATURE_KEYS.paidCheckout:
      return isPaidCheckoutEnabled(env, now, options)
    default: {
      const _exhaustive = featureKey
      void _exhaustive
      return !production
    }
  }
}

/**
 * @param {keyof typeof FEATURE_KEYS | string} featureKey
 * @param {NodeJS.ProcessEnv | Record<string, unknown>} [env]
 * @param {Date} [now]
 * @returns {{ enabled: boolean, reason: 'production_coming_soon' | null }}
 */
export function getFeatureAvailability(featureKey, env = process.env, now = new Date()) {
  const enabled = isFeatureEnabled(featureKey, env, now)
  return {
    enabled,
    reason: enabled ? null : 'production_coming_soon',
  }
}

export function isRecurringMembershipPlan(plan) {
  return (plan?.collection_mode ?? plan?.collectionMode) === 'recurring'
}

export function filterPublicMembershipPlans(plans, env = process.env) {
  const rows = Array.isArray(plans) ? plans : []
  return isFeatureEnabled(FEATURE_KEYS.recurringMembership, env)
    ? rows
    : rows.filter((plan) => !isRecurringMembershipPlan(plan))
}

export function assertFeatureAvailable(env, message) {
  if (!isAppProduction(env)) return
  throw new HttpError(409, message, { code: FEATURE_COMING_SOON })
}

/**
 * Abre cobros si el override lo permite o si ya pasó `registration_opens_at`
 * del evento de lanzamiento (Pitbull / destacado) en admin.
 */
export async function assertPaidCheckoutAvailable(
  env = process.env,
  now = new Date(),
  options = {},
) {
  const override = resolvePaidCheckoutOverride(env)
  if (override === true) return
  if (override === false) {
    throw new HttpError(
      409,
      'Los pagos y las inscripciones con cobro abren próximamente.',
      { code: FEATURE_COMING_SOON },
    )
  }

  if (!isAppProduction(env)) return

  if (resolvePaymentsMockFlag(env) === false) {
    throw new HttpError(
      409,
      'Los pagos y las inscripciones con cobro abren próximamente.',
      { code: FEATURE_COMING_SOON },
    )
  }

  let opensAt = options.registrationOpensAt ?? null
  if (!opensAt && options.skipScheduleLookup !== true) {
    opensAt = await resolvePlatformRegistrationOpensAt(options.client)
  }

  if (hasRegistrationOpensAtPassed(opensAt, now)) return

  throw new HttpError(
    409,
    'Los pagos y las inscripciones con cobro abren próximamente.',
    { code: FEATURE_COMING_SOON },
  )
}

/** Combo requiere checkout de pago habilitado; la oferta vive en DB. */
export async function assertComboCheckoutAvailable(env = process.env, now = new Date(), options = {}) {
  await assertPaidCheckoutAvailable(env, now, options)
}

export function assertRecurringMembershipAvailable(env) {
  if (isFeatureEnabled(FEATURE_KEYS.recurringMembership, env)) return
  throw new HttpError(
    409,
    'La afiliación con débito automático está disponible próximamente en producción.',
    { code: FEATURE_COMING_SOON },
  )
}

export function assertPricingWritesEnabled(env = process.env) {
  if (isFeatureEnabled(FEATURE_KEYS.pricingWrites, env)) return
  throw new HttpError(
    409,
    'La configuración económica está disponible próximamente en producción.',
    { code: FEATURE_COMING_SOON },
  )
}
