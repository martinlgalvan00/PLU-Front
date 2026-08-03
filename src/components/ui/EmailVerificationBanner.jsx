import { useState } from 'react'
import { MailWarning } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { resendAthleteVerification } from '../../services/athleteApi.js'

/**
 * EmailVerificationBanner — PLU ARG
 *
 * Afiliarse e inscribirse exigen correo confirmado (`assertEmailVerified` en
 * server/routes/athletes.js). Si no lo estaba, el checkout devolvía "confirmá
 * tu correo, te reenviamos el enlace desde tu cuenta" y en la cuenta no había
 * nada: el endpoint de reenvío existía sin ninguna UI que lo llamara y el
 * perfil ni siquiera exponía el estado de verificación. El atleta quedaba
 * trabado sin acción posible.
 *
 * Va arriba de las secciones de la cuenta y no dentro de la de afiliación: el
 * bloqueo también alcanza a la inscripción a torneos.
 */
export default function EmailVerificationBanner({ athlete }) {
  const { t } = useI18n()
  const [state, setState] = useState('idle')

  // `emailVerifiedAt` llega del snapshot; si el backend todavía no lo informa
  // no se muestra nada, para no acusar de "sin verificar" a una cuenta que sí
  // lo está.
  if (!athlete || athlete.emailVerifiedAt !== null) return null

  async function resend() {
    setState('sending')
    try {
      const result = await resendAthleteVerification()
      setState(result?.alreadyVerified ? 'verified' : 'sent')
    } catch {
      setState('error')
    }
  }

  const message = {
    idle: t('account.emailVerification.lead'),
    sending: t('account.emailVerification.sending'),
    sent: t('account.emailVerification.sent'),
    verified: t('account.emailVerification.alreadyVerified'),
    error: t('account.emailVerification.error'),
  }[state]

  return (
    <aside className="account-verify" role="status" aria-live="polite">
      <span className="account-verify__icon" aria-hidden>
        <MailWarning size={18} />
      </span>
      <div className="account-verify__copy">
        <p className="account-verify__title">{t('account.emailVerification.title')}</p>
        <p className="account-verify__lead">{message}</p>
        <p className="account-verify__email">{athlete.email}</p>
      </div>
      {state !== 'sent' && state !== 'verified' ? (
        <button
          type="button"
          className="account-verify__action"
          disabled={state === 'sending'}
          onClick={resend}
        >
          {t('account.emailVerification.resend')}
        </button>
      ) : null}
    </aside>
  )
}
