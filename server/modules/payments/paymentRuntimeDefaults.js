/**
 * Defaults fijos del runtime de pagos.
 * No se configuran por env: recovery siempre corre y el webhook acredita inline
 * (el job queda como red de seguridad ante fallas transitorias).
 */
export const PAYMENT_RECOVERY_JOB_ENABLED = true
export const PAYMENT_WEBHOOK_DEFER_PROCESSING = false
export const PAYMENT_RECOVERY_JOB_INTERVAL_MS = 60_000
