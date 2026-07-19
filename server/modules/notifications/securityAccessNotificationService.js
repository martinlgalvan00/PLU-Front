import { queueTransactionalEmail } from './notificationWorkflow.js'
import { buildSecurityGatePath } from '../../../src/lib/securityGateRoute.js'

/**
 * securityAccessNotificationService.js — PLU ARG
 *
 * Le manda a cada cuenta de seguridad recién creada su acceso a la puerta
 * del evento: link + credenciales temporales. Mismo patrón que
 * paymentNotificationService.js (queueTransactionalEmail con repository +
 * brevo para logging e idempotencia).
 *
 * El envío es best-effort: el alta de la cuenta ya ocurrió en la DB antes
 * de llamar acá, así que un fallo de Brevo NO debe tirar el request. El
 * caller igual muestra las credenciales en pantalla como respaldo.
 */
export function createSecurityAccessNotificationService({ repository, brevo, env = process.env }) {
  const appUrl = (env.APP_URL ?? env.VITE_APP_URL ?? '').replace(/\/$/, '')

  return function notifySecurityAccess({ user, tempPassword = null, event, accessUrl = null, idempotencyKey }) {
    // accessUrl (link con token de acceso directo) tiene prioridad sobre el
    // link de puerta "pelado" — si viene, el mail deja entrar sin contraseña.
    const gateUrl = accessUrl || (appUrl && event?.slug ? `${appUrl}${buildSecurityGatePath(event.slug)}` : '')

    return queueTransactionalEmail(
      'security_access',
      {
        to: user.email,
        entityType: 'security_user',
        entityId: user.id,
        idempotencyKey: idempotencyKey ?? `email:security-access:${user.id}`,
        templateId: env.BREVO_TEMPLATE_SECURITY_ACCESS,
        params: {
          name: user.name,
          email: user.email,
          tempPassword: tempPassword ?? '',
          hasPassword: Boolean(tempPassword),
          eventTitle: event?.title ?? '',
          gateUrl,
        },
      },
      { repository, brevo },
    )
  }
}
