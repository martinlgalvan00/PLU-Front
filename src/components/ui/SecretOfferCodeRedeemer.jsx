import { useId, useState } from 'react'
import { Check, KeyRound, LoaderCircle } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  clearPendingPromotionCode,
  normalizePromotionCode,
  promotionDestination,
  redeemPromotionCode,
  savePendingPromotionCode,
} from '../../services/promotionCodeService.js'
import { waitForSecretOfferRedirect } from '../../services/secretOfferRedemptionService.js'
import CodeScanButton from './CodeScanButton.jsx'
import '../../styles/components/secret-code-redeemer.css'
import '../../styles/components/code-band.css'

/**
 * Canje universal de códigos. Vive en Mi cuenta, Eventos, Pitbull y Entradas.
 *
 * Se presenta con el registro de la credencial (ver `code-band.css`): sello,
 * filo de oro, y el código en el mismo mono espaciado que el número de socio. El
 * estado del canje se dice en palabras en la ficha superior de la banda —igual
 * que un documento emitido— en vez de pintarse con color.
 *
 * La lógica es la de siempre: el servidor resuelve qué es el código y a dónde
 * lleva (`redeemPromotionCode`), y acá sólo se refleja.
 */
export default function SecretOfferCodeRedeemer({
  session = null,
  onNavigate,
  onOfferUnlocked,
  className = '',
}) {
  const { t } = useI18n()
  const inputId = useId()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [state, setState] = useState('idle')
  const [reason, setReason] = useState('')

  async function redeem(event) {
    event.preventDefault()
    await attemptRedeem(code)
  }

  async function attemptRedeem(rawCode) {
    const normalized = normalizePromotionCode(rawCode)
    if (!normalized || state === 'checking' || state === 'redirecting') return
    if (session?.role !== 'athlete_plu') {
      savePendingPromotionCode(normalized, { surface: 'global' })
      setState('login')
      setReason('')
      return
    }

    setState('checking')
    setReason('')
    try {
      const result = await redeemPromotionCode(normalized, { surface: 'global' })
      if (!result.accepted) {
        setReason(result.reason ?? 'not_found')
        setState('error')
        return
      }
      setCode(result.code)
      const destination = promotionDestination(result)
      if (result.action !== 'open_exclusive_offer') {
        savePendingPromotionCode(result.code, {
          surface: 'global',
          destination: result.destination ?? null,
        })
      } else {
        clearPendingPromotionCode()
      }
      if (!destination) {
        setState('accepted')
        return
      }
      setState('redirecting')
      // Si el destino es la ficha secreta, hay que refrescarla ANTES de saltar:
      // esta misma página puede ya estar montada (el widget vive dentro del
      // perfil), así que un simple `onNavigate` no alcanza — sin este refresh,
      // AthleteProfilePage sigue viendo la lista de ofertas vieja, filtra la
      // ficha por no tener oferta todavía y el salto no lleva a ningún lado.
      await Promise.all([
        result.action === 'open_exclusive_offer' ? onOfferUnlocked?.() : null,
        waitForSecretOfferRedirect(),
      ])
      onNavigate?.(destination.view, destination.options)
    } catch (error) {
      if (error?.status === 401) {
        setState('login')
        return
      }
      setReason('service_unavailable')
      setState('error')
    }
  }

  const classes = ['secret-code-redeemer', className].filter(Boolean).join(' ')
  const checking = state === 'checking'
  const settled = state === 'redirecting' || state === 'accepted'
  // El estado se dice, no se pinta: es la misma ficha de una credencial emitida.
  const status = checking
    ? t('codeBand.statusChecking')
    : settled
      ? t('codeBand.statusDone')
      : state === 'error'
        ? t('codeBand.statusError')
        : t('codeBand.statusIdle')

  return (
    <aside className={classes} aria-label={t('secretOfferRedeemer.ariaLabel')}>
      {!open ? (
        <button
          type="button"
          className="code-band-toggle secret-code-redeemer__toggle"
          aria-expanded="false"
          onClick={() => setOpen(true)}
        >
          <span className="code-band-toggle__seal" aria-hidden>
            <KeyRound size={13} />
          </span>
          {t('secretOfferRedeemer.toggle')}
        </button>
      ) : (
        <form className="secret-code-redeemer__form" onSubmit={redeem} noValidate>
          <label className="visually-hidden" htmlFor={inputId}>
            {t('secretOfferRedeemer.label')}
          </label>
          <div
            className={`code-band${state === 'error' ? ' code-band--error' : ''}`}
            data-state={state}
          >
            <span className="code-band__grain" aria-hidden />
            <div className="code-band__frame">
              <div className="code-band__head">
                <span className="code-band__mark">{t('codeBand.markKey')}</span>
                <span
                  className={`code-band__status${
                    settled
                      ? ' code-band__status--done'
                      : state === 'error'
                        ? ' code-band__status--error'
                        : ''
                  }`}
                  role="status"
                >
                  {status}
                </span>
              </div>
              <div className="code-band__row">
                <input
                  id={inputId}
                  className="code-band__input"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={code}
                  placeholder={t('secretOfferRedeemer.placeholder')}
                  disabled={checking || settled}
                  onChange={(event) => {
                    setCode(event.target.value.toUpperCase())
                    if (state !== 'idle') setState('idle')
                    setReason('')
                  }}
                />
                {settled ? (
                  <Check size={18} aria-hidden className="secret-code-redeemer__seal-check" />
                ) : (
                  <>
                    <CodeScanButton
                      className="secret-code-redeemer__scan"
                      disabled={checking}
                      onScan={(scanned) => {
                        setCode(scanned)
                        void attemptRedeem(scanned)
                      }}
                    />
                    <button
                      type="submit"
                      className="code-band__chip"
                      disabled={checking || !code.trim()}
                    >
                      {checking ? (
                        <LoaderCircle className="is-spinning" size={15} aria-hidden />
                      ) : null}
                      {checking
                        ? t('secretOfferRedeemer.checking')
                        : t('secretOfferRedeemer.apply')}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {state === 'redirecting' || state === 'accepted' ? (
            <div className="code-band-done" role="status" aria-live="polite">
              <strong>
                {t(
                  state === 'accepted'
                    ? 'secretOfferRedeemer.acceptedTitle'
                    : 'secretOfferRedeemer.redirectingTitle',
                )}
              </strong>
              <span>
                {t(
                  state === 'accepted'
                    ? 'secretOfferRedeemer.acceptedLead'
                    : 'secretOfferRedeemer.redirectingLead',
                )}
              </span>
            </div>
          ) : (
            <p className="code-band-hint">{t('secretOfferRedeemer.hint')}</p>
          )}

          {state === 'login' ? (
            <p className="secret-code-redeemer__message" role="status">
              {t('secretOfferRedeemer.loginRequired')}{' '}
              <button type="button" onClick={() => onNavigate?.('login')}>
                {t('secretOfferRedeemer.loginAction')}
              </button>
            </p>
          ) : null}
          {state === 'error' ? (
            <p className="code-band-error secret-code-redeemer__message is-error" role="alert">
              {t(`secretOfferRedeemer.error.${reason}`)}
            </p>
          ) : null}
        </form>
      )}
    </aside>
  )
}
