import { logger, runWithRequestContext, newRequestId } from '../lib/logger.js'
import { createBrevoAdapter } from '../modules/notifications/brevoAdapter.js'
import { createPaymentNotificationService } from '../modules/notifications/paymentNotificationService.js'
import { createSupabaseNotificationRepository } from '../modules/notifications/supabaseNotificationRepository.js'
import { createPaymentAuditTrail } from '../modules/payments/paymentAuditTrail.js'
import { createPaymentProviderAdapter } from '../modules/payments/createPaymentProviderAdapter.js'
import {
  PAYMENT_REVALIDATION_JOB_INTERVAL_MS,
  isPaymentRevalidationJobEnabled,
} from '../modules/payments/paymentRuntimeDefaults.js'
import { revalidatePaymentOrders } from '../modules/payments/paymentRevalidationWorkflow.js'
import { createSupabasePaymentRepository } from '../modules/payments/supabasePaymentRepository.js'

/**
 * Corre el mismo barrido que dispara el botón "Revalidar" del panel, pero
 * solo, sobre las órdenes de Mercado Pago no aprobadas de los últimos días.
 * Existe para el caso donde nadie del staff nota a tiempo que una orden quedó
 * `cancelado`/`rechazado` por el cron de expiración mientras la plata sí
 * entró: sin este job, esa orden se queda mal etiquetada hasta que alguien la
 * mire a mano.
 */
export async function runPaymentRevalidationJob({ client, env = process.env } = {}) {
  if (!client) throw new Error('Supabase no está configurado para revalidar pagos.')

  const repository = createSupabasePaymentRepository(client)
  const mercadoPago = createPaymentProviderAdapter({ env })
  const notifyPaymentApplied = createPaymentNotificationService({
    repository: createSupabaseNotificationRepository(client),
    brevo: createBrevoAdapter({ env }),
    env,
  })

  return runWithRequestContext({ requestId: `revalidation-${newRequestId()}` }, () =>
    revalidatePaymentOrders({
      repository,
      mercadoPago,
      notifyPaymentApplied,
      auditTrail: createPaymentAuditTrail({ client }),
      apply: true,
      actor: 'job:payment-revalidation',
      sinceDays: Number(env.PAYMENT_REVALIDATION_SINCE_DAYS) || 3,
      limit: Number(env.PAYMENT_REVALIDATION_BATCH_SIZE) || 25,
    }),
  )
}

export function startPaymentRevalidationJob({ client, env = process.env } = {}) {
  if (!isPaymentRevalidationJobEnabled(env) || !client) return null

  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      // El resumen (revisadas/divergentes/corregidas/fallidas) ya se loguea
      // estructurado dentro del workflow; acá solo interesa lo que no cubre.
      await runPaymentRevalidationJob({ client, env })
    } catch (error) {
      logger.error('payment.revalidation_job_failed', { err: error })
    } finally {
      running = false
    }
  }

  void run()
  const timer = setInterval(run, Math.max(60_000, PAYMENT_REVALIDATION_JOB_INTERVAL_MS))
  timer.unref()
  return timer
}
