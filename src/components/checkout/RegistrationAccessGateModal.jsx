import { useState } from 'react'
import { KeyRound, Loader2, LockKeyhole, X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { verifyRegistrationAccessCode } from '../../services/registrationAccessService.js'
import { usePaymentModal } from './usePaymentModal.js'
import '../../styles/components/registration-access-code.css'

/**
 * Puerta de la tanda privada. Aparece apenas el atleta entra a un checkout que
 * el admin restringió con contraseña, y no deja ver ni tocar el pago hasta que
 * el código valide.
 *
 * `scopes` llega desde el checkout con lo que hace falta desbloquear: solo
 * afiliación, solo inscripción, o las dos en el combo. Cada una se valida por
 * separado contra su propia tanda, porque el admin puede tener abierta una y
 * cerrada la otra.
 *
 * Esto es UX, no permiso: el alta de la orden vuelve a validar los mismos
 * códigos contra el hash, así que cerrar el modal por devtools no habilita
 * ningún pago.
 */
export default function RegistrationAccessGateModal({
  scopes = [],
  eventSlug = null,
  onUnlock,
  onCancel,
}) {
  const { t } = useI18n()
  const panelRef = usePaymentModal(onCancel)
  const [codes, setCodes] = useState({ membership: '', registration: '' })
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  const needsMembership = scopes.includes('membership')
  const needsRegistration = scopes.includes('registration')
  const missing =
    (needsMembership && !codes.membership.trim()) ||
    (needsRegistration && !codes.registration.trim())

  // Por `status` y no por `instanceof ApiError`: el error puede llegar envuelto
  // (un interceptor, un reintento) y ahí el 403 seguiría siendo un código malo,
  // pero el atleta vería el mensaje crudo del backend en vez del nuestro.
  function mapError(cause) {
    if (cause?.status === 403) return t('pages.register.accessGate.invalid')
    if (cause?.status === 429) return t('pages.register.accessGate.throttled')
    if (cause?.status === 401) return t('pages.register.accessGate.expiredSession')
    if (cause?.status === 0) return t('pages.register.accessGate.offline')
    return cause?.message || t('pages.register.accessGate.genericError')
  }

  async function submit(event) {
    event.preventDefault()
    if (missing || checking) return
    setChecking(true)
    setError('')
    try {
      // En serie y no en paralelo: si el atleta erró el código de afiliación,
      // no tiene sentido gastarle un intento del limiter al de inscripción.
      if (needsMembership) {
        await verifyRegistrationAccessCode({ scope: 'membership', code: codes.membership.trim() })
      }
      if (needsRegistration) {
        await verifyRegistrationAccessCode({
          scope: 'registration',
          eventSlug,
          code: codes.registration.trim(),
        })
      }
      onUnlock?.({
        membershipCode: needsMembership ? codes.membership.trim() : '',
        registrationCode: needsRegistration ? codes.registration.trim() : '',
      })
    } catch (cause) {
      setError(mapError(cause))
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="registration-access-gate__overlay" role="presentation" onMouseDown={onCancel}>
      <section
        ref={panelRef}
        aria-describedby="registration-access-gate-lead"
        aria-labelledby="registration-access-gate-title"
        aria-modal="true"
        className="registration-access-gate"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="registration-access-gate__header">
          <span className="registration-access-gate__badge">
            <LockKeyhole size={15} strokeWidth={1.75} aria-hidden />
            {t('pages.register.accessGate.badge')}
          </span>
          <button
            type="button"
            className="registration-access-gate__close"
            onClick={onCancel}
            aria-label={t('pages.register.accessGate.close')}
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        <h2 id="registration-access-gate-title">{t('pages.register.accessGate.title')}</h2>
        <p id="registration-access-gate-lead" className="registration-access-gate__lead">
          {t('pages.register.accessGate.lead')}
        </p>

        <form className="registration-access-gate__form" onSubmit={submit} noValidate>
          <fieldset disabled={checking}>
            {needsMembership ? (
              <label htmlFor="registration-access-gate-membership">
                <span>{t('pages.register.accessGate.membershipLabel')}</span>
                <input
                  id="registration-access-gate-membership"
                  type="password"
                  autoComplete="one-time-code"
                  spellCheck={false}
                  maxLength={72}
                  value={codes.membership}
                  onChange={(event) => {
                    setError('')
                    setCodes((current) => ({ ...current, membership: event.target.value }))
                  }}
                  placeholder={t('pages.register.accessGate.membershipPlaceholder')}
                />
              </label>
            ) : null}

            {needsRegistration ? (
              <label htmlFor="registration-access-gate-registration">
                <span>{t('pages.register.accessGate.registrationLabel')}</span>
                <input
                  id="registration-access-gate-registration"
                  type="password"
                  autoComplete="one-time-code"
                  spellCheck={false}
                  maxLength={72}
                  value={codes.registration}
                  onChange={(event) => {
                    setError('')
                    setCodes((current) => ({ ...current, registration: event.target.value }))
                  }}
                  placeholder={t('pages.register.accessGate.registrationPlaceholder')}
                />
              </label>
            ) : null}
          </fieldset>

          {error ? (
            <p className="registration-access-gate__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="registration-access-gate__actions">
            <button
              type="button"
              className="registration-access-gate__cancel"
              onClick={onCancel}
              disabled={checking}
            >
              {t('pages.register.accessGate.cancel')}
            </button>
            <button
              type="submit"
              className="registration-access-gate__submit"
              disabled={missing || checking}
              aria-busy={checking || undefined}
            >
              {checking ? (
                <Loader2 size={16} className="registration-access-gate__spinner" aria-hidden />
              ) : (
                <KeyRound size={16} aria-hidden />
              )}
              {checking
                ? t('pages.register.accessGate.checking')
                : t('pages.register.accessGate.submit')}
            </button>
          </div>
        </form>

        <p className="registration-access-gate__footnote">{t('pages.register.accessGate.help')}</p>
      </section>
    </div>
  )
}
