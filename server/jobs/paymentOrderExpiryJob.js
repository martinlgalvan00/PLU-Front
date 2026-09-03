import { createBrevoAdapter } from '../modules/notifications/brevoAdapter.js'
import { createEmailDispatcher } from '../modules/notifications/emailDispatcher.js'
import { createSupabaseNotificationRepository } from '../modules/notifications/supabaseNotificationRepository.js'
import { processPaymentOrderExpiryNotifications } from '../modules/payments/paymentOrderExpiryNotificationWorkflow.js'

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000

export function runPaymentOrderExpiryJob({ client, env = process.env } = {}) {
  if (!client) throw new Error('Supabase no está configurado para avisos de vencimiento de pago.')

  const repository = createSupabaseNotificationRepository(client)
  const brevo = createBrevoAdapter({ env })
  return processPaymentOrderExpiryNotifications({
    repository,
    dispatcher: createEmailDispatcher({ repository, brevo, env }),
    appUrl: env.APP_URL ?? env.VITE_APP_URL ?? 'http://localhost:5173',
  })
}

/**
 * A diferencia de `membershipRenewalJob` (opt-in), este job es opt-out: es
 * puramente de base de datos + dispatcher idempotente (mismo `for update skip
 * locked` y `idempotency_key` que protegen al resto de la cola de emails), sin
 * el riesgo de doble-cobro contra un proveedor externo que sí justifica que
 * `payment-recovery`/`payment-revalidation` requieran opt-in explícito. Un
 * aviso de vencimiento que no sale porque alguien olvidó prender un flag es
 * peor acá que en renovación de afiliación, donde el cron de expiración de
 * membresías ya es la red de seguridad real.
 */
export function startPaymentOrderExpiryJob({ client, env = process.env } = {}) {
  if (env.PAYMENT_ORDER_EXPIRY_JOB_ENABLED === 'false' || !client) return null

  const run = () =>
    runPaymentOrderExpiryJob({ client, env }).catch((error) =>
      console.error('payment-order-expiry-job:', error),
    )

  void run()
  const intervalMs = Number(env.PAYMENT_ORDER_EXPIRY_JOB_INTERVAL_MS) || DEFAULT_INTERVAL_MS
  const timer = setInterval(run, Math.max(60_000, intervalMs))
  timer.unref()
  return timer
}
