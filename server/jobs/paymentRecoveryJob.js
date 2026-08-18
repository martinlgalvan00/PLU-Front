import { logger, runWithRequestContext, newRequestId } from '../lib/logger.js'
import { createBrevoAdapter } from '../modules/notifications/brevoAdapter.js'
import { createPaymentNotificationService } from '../modules/notifications/paymentNotificationService.js'
import { createSupabaseNotificationRepository } from '../modules/notifications/supabaseNotificationRepository.js'
import { createPaymentAuditTrail } from '../modules/payments/paymentAuditTrail.js'
import { createPaymentProviderAdapter } from '../modules/payments/createPaymentProviderAdapter.js'
import {
  PAYMENT_RECOVERY_JOB_ENABLED,
  PAYMENT_RECOVERY_JOB_INTERVAL_MS,
} from '../modules/payments/paymentRuntimeDefaults.js'
import { recoverPaymentOperations } from '../modules/payments/paymentRecoveryWorkflow.js'
import { createSupabasePaymentRepository } from '../modules/payments/supabasePaymentRepository.js'

export async function runPaymentRecoveryJob({ client, env = process.env } = {}) {
  if (!client) throw new Error('Supabase no está configurado para recuperar pagos.')

  const repository = createSupabasePaymentRepository(client)
  const mercadoPago = createPaymentProviderAdapter({ env })
  const notifyPaymentApplied = createPaymentNotificationService({
    repository: createSupabaseNotificationRepository(client),
    brevo: createBrevoAdapter({ env }),
    env,
  })

  // El job corre fuera de un request: se le abre su propio contexto para que
  // cada corrida tenga un id propio y sus asientos se puedan agrupar.
  return runWithRequestContext({ requestId: `recovery-${newRequestId()}` }, () =>
    recoverPaymentOperations({
      repository,
      mercadoPago,
      notifyPaymentApplied,
      auditTrail: createPaymentAuditTrail({ client }),
      eventLimit: Number(env.PAYMENT_RECOVERY_BATCH_SIZE) || 20,
      reconciliationLimit: Number(env.PAYMENT_RECOVERY_BATCH_SIZE) || 20,
    }),
  )
}

export function startPaymentRecoveryJob({ client, env = process.env } = {}) {
  if (!PAYMENT_RECOVERY_JOB_ENABLED || !client) return null

  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      // El resumen ya se loguea estructurado dentro del workflow (incluye el
      // motivo de cada falla); aca solo queda lo que ese resumen no cubre.
      await runPaymentRecoveryJob({ client, env })
    } catch (error) {
      logger.error('payment.recovery_job_failed', { err: error })
    } finally {
      running = false
    }
  }

  void run()
  const timer = setInterval(run, Math.max(30_000, PAYMENT_RECOVERY_JOB_INTERVAL_MS))
  timer.unref()
  return timer
}
