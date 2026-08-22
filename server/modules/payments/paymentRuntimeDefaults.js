/**
 * El loop residente solo puede correr en una instancia deliberadamente
 * elegida. Si cada API local conectada a la misma Supabase lo inicia, un
 * Access Token distinto puede reclamar y conciliar pagos creados por otra
 * cuenta de Mercado Pago. El cron autenticado no depende de este flag.
 */
export function isPaymentRecoveryJobEnabled(env = process.env) {
  return (
    String(env.PAYMENT_RECOVERY_JOB_ENABLED ?? '')
      .trim()
      .toLowerCase() === 'true'
  )
}

export const PAYMENT_WEBHOOK_DEFER_PROCESSING = false
export const PAYMENT_RECOVERY_JOB_INTERVAL_MS = 60_000

/**
 * Mismo riesgo que `isPaymentRecoveryJobEnabled`: el barrido de revalidación
 * también aplica pagos contra Mercado Pago, así que solo puede correr en una
 * instancia elegida a propósito. El cron autenticado no depende de este flag.
 */
export function isPaymentRevalidationJobEnabled(env = process.env) {
  return (
    String(env.PAYMENT_REVALIDATION_JOB_ENABLED ?? '')
      .trim()
      .toLowerCase() === 'true'
  )
}

export const PAYMENT_REVALIDATION_JOB_INTERVAL_MS = 10 * 60_000
