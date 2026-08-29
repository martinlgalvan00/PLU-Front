import {
  isPaymentProofRetentionJobEnabled,
  runPaymentProofRetention,
} from '../modules/payments/paymentProofRetention.js'

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000 // 1 h
const MIN_INTERVAL_MS = 5 * 60 * 1000

export async function runPaymentProofRetentionJob({ client, env = process.env, now = new Date() } = {}) {
  if (!isPaymentProofRetentionJobEnabled(env)) {
    return { status: 'disabled' }
  }
  if (!client) throw new Error('Supabase no está configurado para retención de comprobantes.')

  const result = await runPaymentProofRetention({ client, env, now })
  const totalPurged = (result.athlete?.purged ?? 0) + (result.ticket?.purged ?? 0)
  const totalFailed = (result.athlete?.failed ?? 0) + (result.ticket?.failed ?? 0)
  if (totalPurged > 0 || totalFailed > 0) {
    console.info(
      `payment-proof-retention-job: purged=${totalPurged} failed=${totalFailed} retentionHours=${result.retentionHours}`,
    )
  }
  if (totalFailed > 0) {
    console.error('payment-proof-retention-job: fallos parciales', {
      athlete: result.athlete?.errors,
      ticket: result.ticket?.errors,
    })
  }
  return result
}

export function startPaymentProofRetentionJob({ client, env = process.env } = {}) {
  if (!isPaymentProofRetentionJobEnabled(env) || !client) return null

  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      await runPaymentProofRetentionJob({ client, env })
    } catch (error) {
      console.error('payment-proof-retention-job:', error)
    } finally {
      running = false
    }
  }

  void run()
  const intervalMs = Math.max(
    MIN_INTERVAL_MS,
    Number(env.PAYMENT_PROOF_RETENTION_JOB_INTERVAL_MS) || DEFAULT_INTERVAL_MS,
  )
  const timer = setInterval(run, intervalMs)
  timer.unref()
  return timer
}
