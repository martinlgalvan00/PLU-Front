import { useState } from 'react'
import { MailWarning } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { resendAthleteVerification, verifyAthleteEmailCode } from '../../services/athleteApi.js'

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
 *
 * El OTP de 6 dígitos es fallback del mismo mail, y solo se ofrece después de
 * un envío confirmado: mostrar el input antes implicaba que el código ya había
 * llegado, y el alta/reenvío podían haber quedado en skipped sin avisarlo.
 */
export default function EmailVerificationBanner({ athlete }) {
  const { t } = useI18n()
  const [state, setState] = useState(() => (athlete?.emailVerificationSent ? 'sent' : 'idle'))
  const [code, setCode] = useState('')
  const [otpState, setOtpState] = useState('idle')
  const [otpError, setOtpError] = useState('')

  // `emailVerifiedAt` llega del snapshot; si el backend todavía no lo informa
  // no se muestra nada, para no acusar de "sin verificar" a una cuenta que sí
  // lo está.
  if (!athlete || athlete.emailVerifiedAt !== null) return null

  async function resend() {
    setState('sending')
    setOtpError('')
    try {
      const result = await resendAthleteVerification()
      setState(result?.alreadyVerified ? 'verified' : 'sent')
      if (result?.alreadyVerified) {
        window.dispatchEvent(new CustomEvent('plu:email-verified'))
      }
    } catch {
      setState('error')
    }
  }

  async function submitCode(event) {
    event.preventDefault()
    const normalized = code.replace(/\D/g, '').slice(0, 6)
    if (normalized.length !== 6) {
      setOtpError(t('account.emailVerification.otpInvalid'))
      return
    }

    setOtpState('verifying')
    setOtpError('')
    try {
      const result = await verifyAthleteEmailCode(normalized)
      setOtpState('verified')
      setState('verified')
      window.dispatchEvent(new CustomEvent('plu:email-verified', {
        detail: { email: result?.email, alreadyVerified: result?.alreadyVerified },
      }))
    } catch (error) {
      setOtpState('idle')
      const apiCode = error?.body?.code ?? error?.code
      if (apiCode === 'EMAIL_OTP_LOCKED') {
        setOtpError(t('account.emailVerification.otpLocked'))
      } else if (apiCode === 'EMAIL_OTP_EXPIRED') {
        setOtpError(t('account.emailVerification.otpExpired'))
      } else {
        setOtpError(t('account.emailVerification.otpInvalid'))
      }
    }
  }

  const message = {
    idle: t('account.emailVerification.lead'),
    sending: t('account.emailVerification.sending'),
    sent: t('account.emailVerification.sent'),
    verified: t('account.emailVerification.alreadyVerified'),
    error: t('account.emailVerification.error'),
  }[state]

  const showActions = state !== 'verified' && otpState !== 'verified'
  const showOtp = showActions && state === 'sent'
  const resendClass = showOtp
    ? 'account-verify__action account-verify__action--ghost'
    : 'account-verify__action'

  return (
    <aside className="account-verify account-verify--email" role="status" aria-live="polite">
      <span className="account-verify__icon" aria-hidden>
        <MailWarning size={18} />
      </span>
      <div className="account-verify__copy">
        <p className="account-verify__title">{t('account.emailVerification.title')}</p>
        <p className="account-verify__lead">{message}</p>
        {athlete.email ? <p className="account-verify__email">{athlete.email}</p> : null}
        {showOtp ? (
          <form className="account-verify__otp" onSubmit={submitCode}>
            <label className="account-verify__otp-label" htmlFor="account-verify-otp">
              {t('account.emailVerification.otpLabel')}
            </label>
            <div className="account-verify__otp-row">
              <input
                id="account-verify-otp"
                className="account-verify__otp-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                placeholder="000000"
                value={code}
                disabled={otpState === 'verifying'}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              <button
                type="submit"
                className="account-verify__otp-submit"
                disabled={otpState === 'verifying' || code.replace(/\D/g, '').length !== 6}
              >
                {otpState === 'verifying'
                  ? t('account.emailVerification.otpVerifying')
                  : t('account.emailVerification.otpSubmit')}
              </button>
            </div>
            {otpError ? <p className="account-verify__otp-error">{otpError}</p> : null}
          </form>
        ) : null}
        {showActions ? (
          <button
            type="button"
            className={resendClass}
            disabled={state === 'sending'}
            onClick={resend}
          >
            {t('account.emailVerification.resend')}
          </button>
        ) : null}
      </div>
    </aside>
  )
}
