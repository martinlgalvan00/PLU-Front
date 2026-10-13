import { recordOperationalAuditEvent } from '../modules/audit/operationalAuditWriter.js'
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
  if (result.disabled) return result

  const trashed = (result.trashed?.athlete ?? 0) + (result.trashed?.ticket ?? 0)
  const purged = result.purged?.purged ?? 0
  const orphans = result.orphans?.registered ?? 0
  const failed = result.purged?.failed ?? 0
  const stageErrors = ['trashed', 'purged', 'orphans'].filter((key) => result[key]?.error)

  if (trashed > 0 || purged > 0 || orphans > 0 || failed > 0 || stageErrors.length > 0) {
    console.info(
      `payment-proof-retention-job: trashed=${trashed} purged=${purged} orphans=${orphans} failed=${failed} mode=${result.mode} days=${result.days} graceDays=${result.graceDays}`,
    )
    // Un registro por corrida con movimiento: qué se movió, qué se borró de verdad.
    await recordOperationalAuditEvent(client, {
      source: 'payment',
      action: 'payment_proofs.retention_run',
      entityType: 'payment_proof_files',
      entityId: 'retention-job',
      actorType: 'system',
      status: failed > 0 || stageErrors.length > 0 ? 'failed' : 'succeeded',
      severity: failed > 0 || stageErrors.length > 0 ? 'warning' : 'info',
      metadata: {
        mode: result.mode,
        days: result.days,
        graceDays: result.graceDays,
        trashed: result.trashed,
        purged: { purged, failed },
        orphans,
        stageErrors: Object.fromEntries(stageErrors.map((key) => [key, result[key].error])),
      },
    })
  }
  if (failed > 0 || stageErrors.length > 0) {
    console.error('payment-proof-retention-job: fallos parciales', {
      purge: result.purged?.errors,
      stageErrors: Object.fromEntries(stageErrors.map((key) => [key, result[key].error])),
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
