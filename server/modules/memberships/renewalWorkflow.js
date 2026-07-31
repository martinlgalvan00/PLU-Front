/**
 * renewalWorkflow.js — PLU ARG
 *
 * Avisos de vencimiento de afiliación. Antes llamaba `brevo.sendTemplate`
 * directo, salteándose `transactional_email_logs`: si un socio decía que no le
 * llegó el aviso, no había registro de nada. Ahora pasa por el dispatcher, con
 * lo cual gana log, lista de supresión, reintentos y fallback HTML.
 *
 * Las dos tablas cumplen roles distintos y por eso se mantienen las dos:
 * `membership_renewal_notifications` responde "¿ya avisamos de este
 * vencimiento?" (una fila por membresía y umbral), y `transactional_email_logs`
 * responde "¿este email concreto se entregó?".
 */
export async function processMembershipRenewals(options = {}) {
  const { repository, dispatcher, appUrl, offsets, limit } = options
  if (!repository || !dispatcher?.configured) {
    return { processed: 0, sent: 0, failed: 0, skipped: true }
  }

  const notifications = await repository.claimRenewals({ offsets, limit })
  let sent = 0
  let failed = 0

  for (const notification of notifications ?? []) {
    try {
      await dispatcher.send('membership_renewal', {
        to: notification.recipientEmail,
        entityType: 'membership',
        entityId: notification.membershipId ?? notification.id,
        // La clave incluye el umbral (`expires_in_30`, `expired`), así que el
        // socio recibe un aviso por cada hito y ninguno repetido.
        idempotencyKey: `email:membership-renewal:${notification.id}`,
        params: {
          name: notification.athleteName,
          memberCode: notification.memberCode,
          expirationDate: notification.expirationDate,
          notificationKey: notification.notificationKey,
          renewalUrl: `${appUrl}/mi-cuenta?section=membership`,
        },
      })
      await repository.completeRenewal(notification.id, { sent: true })
      sent += 1
    } catch (error) {
      await repository.completeRenewal(notification.id, {
        sent: false,
        error: error?.message ?? String(error),
      })
      failed += 1
    }
  }

  return { processed: notifications?.length ?? 0, sent, failed, skipped: false }
}
