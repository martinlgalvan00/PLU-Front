import { createBrevoAdapter } from '../modules/notifications/brevoAdapter.js'
import { createPaymentNotificationService } from '../modules/notifications/paymentNotificationService.js'
import { createSupabaseNotificationRepository } from '../modules/notifications/supabaseNotificationRepository.js'
import { createPaymentProviderAdapter } from '../modules/payments/createPaymentProviderAdapter.js'
import { recoverPaymentOperations } from '../modules/payments/paymentRecoveryWorkflow.js'
import { createSupabasePaymentRepository } from '../modules/payments/supabasePaymentRepository.js'

const DEFAULT_INTERVAL_MS = 60_000

export async function runPaymentRecoveryJob({ client, env = process.env } = {}) {
  if (!client) throw new Error('Supabase no está configurado para recuperar pagos.')

  const repository = createSupabasePaymentRepository(client)
  const mercadoPago = createPaymentProviderAdapter({ env })
  const notifyPaymentApplied = createPaymentNotificationService({
    repository: createSupabaseNotificationRepository(client),
    brevo: createBrevoAdapter({ env }),
    env,
  })

  return recoverPaymentOperations({
    repository,
    mercadoPago,
    notifyPaymentApplied,
    eventLimit: Number(env.PAYMENT_RECOVERY_BATCH_SIZE) || 20,
    reconciliationLimit: Number(env.PAYMENT_RECOVERY_BATCH_SIZE) || 20,
  })
}

export function startPaymentRecoveryJob({ client, env = process.env } = {}) {
  if (env.PAYMENT_RECOVERY_JOB_ENABLED !== 'true' || !client) return null

  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      const result = await runPaymentRecoveryJob({ client, env })
      if (result.claimErrors.length) {
        console.error('payment-recovery-job claims:', result.claimErrors)
      }
      if (result.events.claimed || result.reconciliations.claimed) {
        console.info('payment-recovery-job:', result)
      }
    } catch (error) {
      console.error('payment-recovery-job:', error)
    } finally {
      running = false
    }
  }

  void run()
  const intervalMs = Number(env.PAYMENT_RECOVERY_JOB_INTERVAL_MS) || DEFAULT_INTERVAL_MS
  const timer = setInterval(run, Math.max(30_000, intervalMs))
  timer.unref()
  return timer
}
