import { createEmailDispatcher } from './emailDispatcher.js'
import { buildStaffEmailChangeUrl } from '../../../src/lib/staffEmailChangeRoute.js'

/**
 * staffAccountNotificationService.js — PLU ARG
 *
 * Los tres mails del ciclo de vida de una cuenta del panel:
 *
 *  - `staff_invitation`   alta (o reset): usuario + contraseña temporal.
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
  const appUrl = (env.APP_URL ?? env.VITE_APP_URL ?? '').replace(/\/$/, '')

  function notifyStaffInvitation({ user, tempPassword, roleName = null, idempotencyKey }) {
    return mailer.send('staff_invitation', {
      to: user.email,
      toName: user.name,
      entityType: 'staff_user',
      entityId: user.id,
      // Sin clave en la key, un reset posterior chocaría con el log del alta y
      // el dispatcher lo descartaría por idempotente: el usuario nunca
      // recibiría la contraseña nueva.
      idempotencyKey: idempotencyKey ?? `email:staff-invitation:${user.id}:${tempPassword.slice(-8)}`,
      params: {
        name: user.name,
        email: user.email,
        tempPassword,
        roleName: roleName ?? '',
        loginUrl: appUrl || '',
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
      idempotencyKey: `email:staff-email-change:${user.id}:${token.slice(-16)}`,
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
