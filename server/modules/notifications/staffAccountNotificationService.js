import { createHash } from 'node:crypto'
import { createEmailDispatcher } from './emailDispatcher.js'
import { buildStaffEmailChangeUrl } from '../../../src/lib/staffEmailChangeRoute.js'
import { resolveDeploymentAppUrl } from '../../lib/deploymentEnvironment.js'

/**
 * staffAccountNotificationService.js — PLU ARG
 *
 * Los tres mails del ciclo de vida de una cuenta del panel:
 *
 *  - `staff_invitation`   alta (o reset): enlace firmado para elegir clave.
 *  - `staff_email_change` link firmado a la casilla **nueva** para confirmar.
 *  - `staff_email_changed` aviso a la casilla **vieja** de que ya no manda.
 *
 * Los envíos son best-effort, igual que en `securityAccessNotificationService`:
 * la operación de negocio (alta, reset, cambio de email) ya se confirmó en la
 * base antes de llegar acá, así que un fallo de Brevo no puede tirar el
 * request. Para el alta y el reset el panel muestra además la contraseña en
 * pantalla, que es el respaldo cuando el mail no sale.
 *
 * Los tres están marcados `critical` en el catálogo: son credenciales y avisos
 * de seguridad, no comunicaciones de las que alguien pueda desuscribirse.
 */
export function createStaffAccountNotificationService({
  repository,
  brevo,
  dispatcher,
  env = process.env,
}) {
  const mailer = dispatcher ?? createEmailDispatcher({ repository, brevo, env })
  const appUrl = (resolveDeploymentAppUrl(env) || env.VITE_APP_URL || '').replace(/\/$/, '')

  function notifyStaffInvitation({
    user,
    invitationUrl,
    roleName = null,
    expiresInDays = null,
    idempotencyKey,
  }) {
    return mailer.send('staff_invitation', {
      to: user.email,
      toName: user.name,
      entityType: 'staff_user',
      entityId: user.id,
      idempotencyKey: idempotencyKey ?? `email:staff-invitation:${user.id}`,
      params: {
        name: user.name,
        email: user.email,
        roleName: roleName ?? '',
        invitationUrl: invitationUrl || appUrl || '',
        expiresInDays: expiresInDays ?? '',
      },
    })
  }

  function notifyStaffEmailChange({ user, newEmail, token }) {
    const verificationUrl = appUrl ? buildStaffEmailChangeUrl(appUrl, token) : ''

    return mailer.send('staff_email_change', {
      // Va a la dirección NUEVA: confirmarlo es justamente la prueba de que
      // esa casilla existe y es de quien pidió el cambio.
      to: newEmail,
      toName: user.name,
      entityType: 'staff_user',
      entityId: user.id,
      idempotencyKey: `email:staff-email-change:${user.id}:${createHash('sha256').update(token).digest('hex').slice(0, 24)}`,
      params: {
        name: user.name,
        newEmail,
        verificationUrl,
      },
    })
  }

  function notifyStaffEmailChanged({ user, previousEmail, newEmail }) {
    return mailer.send('staff_email_changed', {
      to: previousEmail,
      toName: user.name,
      entityType: 'staff_user',
      entityId: user.id,
      idempotencyKey: `email:staff-email-changed:${user.id}:${newEmail}`,
      params: {
        name: user.name,
        newEmail,
      },
    })
  }

  return { notifyStaffInvitation, notifyStaffEmailChange, notifyStaffEmailChanged }
}
