import { useId, useState } from 'react'
import { ArrowRight, KeyRound, LoaderCircle } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  clearPendingPromotionCode,
  normalizePromotionCode,
  promotionDestination,
  redeemPromotionCode,
  savePendingPromotionCode,
} from '../../services/promotionCodeService.js'
import { waitForSecretOfferRedirect } from '../../services/secretOfferRedemptionService.js'
import '../../styles/components/secret-code-redeemer.css'

export default function SecretOfferCodeRedeemer({ session = null, onNavigate, className = '' }) {
  const { t } = useI18n()
  const inputId = useId()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [state, setState] = useState('idle')
  const [reason, setReason] = useState('')

  async function redeem(event) {
    event.preventDefault()
    const normalized = normalizePromotionCode(code)
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
      await waitForSecretOfferRedirect()
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

  return (
    <aside className={classes} aria-label={t('secretOfferRedeemer.ariaLabel')}>
      {!open ? (
        <button
          type="button"
          className="secret-code-redeemer__toggle"
          aria-expanded="false"
          onClick={() => setOpen(true)}
        >
          <KeyRound size={16} aria-hidden />
          {t('secretOfferRedeemer.toggle')}
        </button>
      ) : state === 'redirecting' ? (
        <div className="secret-code-redeemer__redirect" role="status" aria-live="polite">
          <LoaderCircle className="is-spinning" size={18} aria-hidden />
          <div>
            <strong>{t('secretOfferRedeemer.redirectingTitle')}</strong>
            <span>{t('secretOfferRedeemer.redirectingLead')}</span>
          </div>
        </div>
      ) : state === 'accepted' ? (
        <div className="secret-code-redeemer__redirect" role="status" aria-live="polite">
          <KeyRound size={18} aria-hidden />
          <div>
            <strong>{t('secretOfferRedeemer.acceptedTitle')}</strong>
            <span>{t('secretOfferRedeemer.acceptedLead')}</span>
          </div>
        </div>
      ) : (
        <form className="secret-code-redeemer__form" onSubmit={redeem} noValidate>
          <div className="secret-code-redeemer__copy">
            <label htmlFor={inputId}>{t('secretOfferRedeemer.label')}</label>
            <span>{t('secretOfferRedeemer.hint')}</span>
          </div>
          <div className="secret-code-redeemer__controls">
            <input
              id={inputId}
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={code}
              placeholder={t('secretOfferRedeemer.placeholder')}
              disabled={state === 'checking'}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase())
                if (state !== 'idle') setState('idle')
                setReason('')
              }}
            />
            <button type="submit" disabled={state === 'checking' || !code.trim()}>
              {state === 'checking' ? (
                <LoaderCircle className="is-spinning" size={16} aria-hidden />
              ) : (
                <ArrowRight size={16} aria-hidden />
              )}
              {state === 'checking'
                ? t('secretOfferRedeemer.checking')
                : t('secretOfferRedeemer.apply')}
            </button>
          </div>
          {state === 'login' ? (
            <p className="secret-code-redeemer__message" role="status">
              {t('secretOfferRedeemer.loginRequired')}{' '}
              <button type="button" onClick={() => onNavigate?.('login')}>
                {t('secretOfferRedeemer.loginAction')}
              </button>
            </p>
          ) : null}
          {state === 'error' ? (
            <p className="secret-code-redeemer__message is-error" role="alert">
              {t(`secretOfferRedeemer.error.${reason}`)}
            </p>
          ) : null}
        </form>
      )}
    </aside>
  )
}
