import { createEmailDispatcher } from './emailDispatcher.js'
import { buildSecurityGatePath } from '../../../src/lib/securityGateRoute.js'
import { resolveDeploymentAppUrl } from '../../lib/deploymentEnvironment.js'

/**
 * securityAccessNotificationService.js — PLU ARG
 *
 * Le manda a cada cuenta de seguridad recién creada su acceso a la puerta del
 * evento: link + credenciales temporales.
 *
 * El envío es best-effort: el alta de la cuenta ya ocurrió en la DB antes de
 * llamar acá, así que un fallo de Brevo NO debe tirar el request. El caller
 * igual muestra las credenciales en pantalla como respaldo.
 *
 * El tipo está marcado como `critical` en el catálogo: una desuscripción vieja
 * no puede dejar a un operador sin su acceso el día del evento.
 */
export function createSecurityAccessNotificationService({
  repository,
  brevo,
  dispatcher,
  env = process.env,
}) {
  const mailer = dispatcher ?? createEmailDispatcher({ repository, brevo, env })
  const appUrl = (resolveDeploymentAppUrl(env) || env.VITE_APP_URL || '').replace(/\/$/, '')

  return function notifySecurityAccess({
    user,
    tempPassword = null,
    event,
    accessUrl = null,
    idempotencyKey,
  }) {
    // accessUrl (link con token de acceso directo) tiene prioridad sobre el
    // link de puerta "pelado" — si viene, el mail deja entrar sin contraseña.
    const gateUrl =
      accessUrl || (appUrl && event?.slug ? `${appUrl}${buildSecurityGatePath(event.slug)}` : '')

    return mailer.send('security_access', {
      to: user.email,
      toName: user.name,
      entityType: 'security_user',
      entityId: user.id,
      idempotencyKey: idempotencyKey ?? `email:security-access:${user.id}`,
      params: {
        name: user.name,
        email: user.email,
        tempPassword: tempPassword ?? '',
        hasPassword: Boolean(tempPassword),
        eventTitle: event?.title ?? '',
        gateUrl,
      },
    })
  }
}
