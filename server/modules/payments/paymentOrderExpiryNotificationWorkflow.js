import { displayPaymentConcept } from '../notifications/paymentNotificationService.js'

/**
 * paymentOrderExpiryNotificationWorkflow.js — PLU ARG
 *
 * Avisos de una orden de pago manual (transferencia/efectivo) sin completar:
 * un recordatorio ~2 días antes de que venza y un aviso final cuando
 * `expire_domain_orders` ya la canceló. Mismo molde que
 * `memberships/renewalWorkflow.js` — pasa por el dispatcher (log, supresión,
 * reintentos, fallback HTML) en vez de llamar a Brevo directo.
 *
 * `payment_order_expiry_notifications` responde "¿ya avisamos de este
 * hito?" (una fila por orden y umbral); `transactional_email_logs` responde
 * "¿este email concreto se entregó?".
 */
export async function processPaymentOrderExpiryNotifications(options = {}) {
  const { repository, dispatcher, appUrl, limit } = options
  if (!repository || !dispatcher?.configured) {
    return { processed: 0, sent: 0, failed: 0, skipped: true }
  }

  const notifications = await repository.claimOrderExpiryNotifications({ limit })
  let sent = 0
  let failed = 0

  for (const notification of notifications ?? []) {
    const type = notification.notificationKey === 'expired' ? 'payment_order_expired' : 'payment_order_reminder'
    try {
      await dispatcher.send(type, {
        to: notification.recipientEmail,
        entityType: 'athlete_payment_order',
        entityId: notification.orderId ?? notification.id,
        // La clave incluye el hito (`reminder`, `expired`), así que la orden
        // recibe un aviso por cada uno y ninguno repetido.
        idempotencyKey: `email:payment-order-${notification.notificationKey}:${notification.id}`,
        params: {
          name: notification.athleteName,
          concept: displayPaymentConcept(notification.concept),
          reference: notification.reference,
          expiresAt: notification.expiresAt,
          accountUrl: `${appUrl}/mi-cuenta?section=payments`,
        },
      })
      await repository.completeOrderExpiryNotification(notification.id, { sent: true })
      sent += 1
    } catch (error) {
      await repository.completeOrderExpiryNotification(notification.id, {
        sent: false,
        error: error?.message ?? String(error),
      })
      failed += 1
    }
  }

  return { processed: notifications?.length ?? 0, sent, failed, skipped: false }
}
