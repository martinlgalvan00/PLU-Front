import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowRight, CheckCircle2, LoaderCircle } from 'lucide-react'
import '../styles/pages/design-phase2.css'
import BrandLogo from '../components/ui/BrandLogo.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { confirmEmailChangeRequest } from '../lib/api.js'

/**
 * StaffEmailChangePage — PLU ARG
 *
 * Confirmación del cambio de email de una cuenta del panel (`?cambio-email=`).
 * Es pública porque el link se abre desde la casilla nueva, que puede no ser
 * el navegador donde vive la sesión.
 *
 * Confirma sola al montar: el usuario ya expresó su intención al pedir el
 * cambio y al abrir el link, así que un segundo botón acá sólo agregaría un
 * paso. El backend es idempotente, de modo que reabrir el link no rompe nada.
 */
export default function StaffEmailChangePage({ token, onDone }) {
  const { t } = useI18n()
  const [state, setState] = useState('pending')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  // StrictMode monta dos veces en desarrollo; sin esto el segundo intento
  // pisaba el resultado del primero con la respuesta idempotente.
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    let cancelled = false
    confirmEmailChangeRequest(token)
      .then((result) => {
        if (cancelled) return
        setEmail(result?.email ?? '')
        setState('done')
      })
      .catch((requestError) => {
        if (cancelled) return
        setError(requestError?.message || t('staffAccount.confirmError'))
        setState('failed')
      })

    return () => {
      cancelled = true
    }
  }, [t, token])

  return (
    <main className="page auth-layout auth-layout--solo">
      <section className="auth-layout__content">
        <div className="auth-immersive-page">
          <div className="auth-immersive-glass" aria-labelledby="staff-email-heading">
            <header className="auth-immersive-glass__header">
              <BrandLogo
                variant="letterhead"
                imgClassName="auth-immersive-glass__logo"
                height={32}
              />
              <div className="auth-immersive-glass__copy">
                <span className="auth-immersive-glass__eyebrow">
                  {t('staffAccount.confirmEyebrow')}
                </span>
                <h1 id="staff-email-heading" className="auth-immersive-glass__title">
                  {state === 'failed'
                    ? t('staffAccount.confirmErrorTitle')
                    : t('staffAccount.confirmTitle')}
                </h1>
                <p className="auth-immersive-glass__lead">
                  {state === 'pending'
                    ? t('staffAccount.confirmPending')
                    : state === 'done'
                      ? t('staffAccount.confirmDone', { email })
                      : error}
                </p>
              </div>
            </header>

            <div className="login-form">
              {state === 'pending' ? (
                <p className="login-form__notice" role="status">
                  <LoaderCircle size={14} aria-hidden /> {t('staffAccount.confirmPending')}
                </p>
              ) : null}

              {state === 'done' ? (
                <p className="login-form__notice" role="status">
                  <CheckCircle2 size={14} aria-hidden /> {t('staffAccount.confirmRelogin')}
                </p>
              ) : null}

              {state === 'failed' ? (
                <p className="form-submit-error" role="alert">
                  <AlertCircle size={14} className="error-icon" />
                  <span>{error}</span>
                </p>
              ) : null}

              {state !== 'pending' ? (
                <button type="button" className="login-submit" onClick={onDone}>
                  {t('staffAccount.confirmGoToLogin')}
                  <ArrowRight size={16} aria-hidden />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
