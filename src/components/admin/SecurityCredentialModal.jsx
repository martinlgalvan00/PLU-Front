import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Mail, ShieldCheck, X } from 'lucide-react'
import { generateCredentialQr } from '../../lib/credentialQr.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useAdminModal } from './useAdminModal.js'

/**
 * Card de credencial de acceso de una cuenta de seguridad: muestra el QR
 * corto, el código XXX-XXX y el vencimiento. Abrirla no emite otra.
 * Regenerar sí rota el código. La emisión vive en el backend (onGenerate).
 */
const EMPTY_CREDENTIAL = {
  status: 'empty',
  url: '',
  expiresAt: null,
  qr: '',
  qrFailed: false,
  code: '',
  expired: false,
}

function credentialIsExpired(result, now = Date.now()) {
  if (result?.expired) return true
  const time = Date.parse(result?.expiresAt ?? '')
  return Number.isFinite(time) && time <= now
}

async function paintCredential(result) {
  let qr = ''
  let qrFailed = false
  if (result?.url) {
    try {
      qr = await generateCredentialQr(result.url)
    } catch {
      qrFailed = true
    }
  }
  return {
    status: 'ready',
    url: result?.url ?? '',
    expiresAt: result?.expiresAt ?? null,
    qr,
    qrFailed,
    code: result?.code ?? '',
    expired: credentialIsExpired(result),
  }
}

export default function SecurityCredentialModal({ user, onGenerate, onClose }) {
  const { locale, t } = useI18n()
  const [state, setState] = useState({
    status: 'loading',
    url: '',
    expiresAt: null,
    qr: '',
    qrFailed: false,
    code: '',
    expired: false,
  })
  const [expiresAt, setExpiresAt] = useState('')
  const [copied, setCopied] = useState('')
  const [emailState, setEmailState] = useState('idle') // idle | sending | sent | error
  const [actionError, setActionError] = useState(false)
  const requestedRef = useRef(false)

  useEffect(() => {
    if (requestedRef.current) return
    requestedRef.current = true
    let active = true
    onGenerate({ read: true })
      .then(async (result) => {
        if (!active) return
        if (!result?.url) {
          setState(EMPTY_CREDENTIAL)
          return
        }
        setState(await paintCredential(result))
      })
      .catch((error) => {
        if (!active) return
        if (error?.status === 404) {
          setState(EMPTY_CREDENTIAL)
          return
        }
        setState((current) => ({ ...current, status: 'error' }))
      })
    return () => {
      active = false
    }
  }, [onGenerate])

  const panelRef = useAdminModal(onClose)

  async function handleCopy(key, value) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      setTimeout(() => setCopied(''), 2000)
    } catch {
      // Sin clipboard el valor ya queda visible para copiar a mano.
    }
  }

  function retryRead() {
    setActionError(false)
    setState((current) => ({ ...current, status: 'loading' }))
    onGenerate({ read: true })
      .then(async (result) => {
        if (!result?.url) {
          setState(EMPTY_CREDENTIAL)
          return
        }
        setState(await paintCredential(result))
      })
      .catch((error) => {
        if (error?.status === 404) {
          setState(EMPTY_CREDENTIAL)
          return
        }
        setState((current) => (current.url ? { ...current, status: 'ready' } : { ...current, status: 'error' }))
      })
  }

  async function handleEmail() {
    setEmailState('sending')
    try {
      const { emailed } = await onGenerate({ sendEmail: true })
      setEmailState(emailed ? 'sent' : 'error')
    } catch {
      setEmailState('error')
    }
  }

  const expiryLabel = state.expiresAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(state.expiresAt),
      )
    : ''

  async function handleRegenerate() {
    const previous = state
    setActionError(false)
    setEmailState('idle')
    setState((current) => ({ ...current, status: 'loading' }))
    try {
      const result = await onGenerate({ sendEmail: false, rotate: true, expiresAt })
      if (!result?.url) throw new Error('empty-credential')
      setState(await paintCredential(result))
    } catch {
      setActionError(true)
      setState(previous.url ? previous : { ...EMPTY_CREDENTIAL, status: 'error' })
    }
  }

  return createPortal(
    <div className="security-credential-modal">
      <button
        type="button"
        className="security-credential-modal__backdrop"
        aria-label={t('common.cancel')}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="security-credential-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('admin.eventEditor.security.credentialTitle')}
      >
        <div className="security-credential-modal__head">
          <div className="security-credential-modal__who">
            <span className="security-credential-modal__eyebrow">
              <ShieldCheck size={13} aria-hidden />
              {t('admin.eventEditor.security.credentialTitle')}
            </span>
            <strong>{user.name}</strong>
            <span className="security-credential-modal__email">{user.email}</span>
          </div>
          <button
            type="button"
            className="security-credential-modal__close"
            onClick={onClose}
            aria-label={t('common.cancel')}
          >
            <X size={16} />
          </button>
        </div>

        {state.status === 'loading' && (
          <p className="security-credential-modal__note">
            {state.url
              ? t('admin.eventEditor.security.credentialLoading')
              : t('admin.eventEditor.security.credentialChecking')}
          </p>
        )}
        {state.status === 'error' && (
          <div className="security-credential-modal__empty">
            <p className="admin-users__form-error">
              {t('admin.eventEditor.security.credentialError')}
            </p>
            <button
              type="button"
              className="admin-event-security__toggle admin-event-security__toggle--celeste"
              onClick={retryRead}
            >
              {t('admin.eventEditor.security.credentialRetry')}
            </button>
          </div>
        )}
        {state.status === 'empty' && (
          <div className="security-credential-modal__empty">
            <p className="security-credential-modal__note">
              {t('admin.eventEditor.security.credentialEmpty')}
            </p>
            <button
              type="button"
              className="admin-event-security__toggle admin-event-security__toggle--celeste"
              onClick={handleRegenerate}
            >
              {t('admin.eventEditor.security.credentialGenerate')}
            </button>
          </div>
        )}

        {state.status === 'ready' && (
          <>
            <div className="security-credential-modal__qr">
              {state.qr ? (
                <img src={state.qr} alt={t('admin.eventEditor.security.credentialQrAlt')} />
              ) : (
                <p className="security-credential-modal__note">
                  {t('admin.eventEditor.security.credentialQrFallback')}
                </p>
              )}
            </div>
            {state.code ? (
              <p className="security-credential-modal__code">
                <span>{t('admin.eventEditor.security.credentialCodeLabel')}</span>
                <strong>{state.code}</strong>
                <button type="button" onClick={() => handleCopy('code', state.code)}>
                  {copied === 'code' ? (
                    <Check size={13} aria-hidden />
                  ) : (
                    <Copy size={13} aria-hidden />
                  )}
                  {copied === 'code'
                    ? t('admin.eventEditor.security.copied')
                    : t('admin.eventEditor.security.copyCode')}
                </button>
              </p>
            ) : null}
            <p className="security-credential-modal__lead">
              {t('admin.eventEditor.security.credentialLead')}
            </p>

            <div className="security-credential-modal__link">
              <code>{state.url}</code>
              <button
                type="button"
                className={`admin-event-security__copy${copied === 'url' ? ' admin-event-security__copy--done' : ''}`}
                onClick={() => handleCopy('url', state.url)}
              >
                {copied === 'url' ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
                {copied === 'url'
                  ? t('admin.eventEditor.security.copied')
                  : t('admin.eventEditor.security.copyLink')}
              </button>
            </div>

            {expiryLabel && (
              <p
                className={`security-credential-modal__expiry${state.expired ? ' security-credential-modal__expiry--past' : ''}`}
              >
                {state.expired
                  ? t('admin.eventEditor.security.credentialExpiredNow', { date: expiryLabel })
                  : t('admin.eventEditor.security.credentialExpiry', { date: expiryLabel })}
              </p>
            )}

            <label className="security-credential-modal__expiry-control">
              <span>{t('admin.eventEditor.security.credentialExpiryCustom')}</span>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
              <small>{t('admin.eventEditor.security.credentialExpiryHint')}</small>
            </label>

            <div className="security-credential-modal__actions">
              <button
                type="button"
                className="admin-event-security__toggle admin-event-security__toggle--celeste"
                onClick={handleRegenerate}
              >
                {t('admin.eventEditor.security.credentialRegenerate')}
              </button>
              <button
                type="button"
                className="admin-event-security__toggle admin-event-security__toggle--celeste"
                onClick={handleEmail}
                disabled={state.expired || emailState === 'sending' || emailState === 'sent'}
              >
                <Mail size={13} aria-hidden />
                {emailState === 'sending'
                  ? t('admin.users.creating')
                  : emailState === 'sent'
                    ? t('admin.eventEditor.security.emailSent')
                    : t('admin.eventEditor.security.credentialEmail')}
              </button>
            </div>
            {actionError && (
              <p className="admin-users__form-error">
                {t('admin.eventEditor.security.credentialError')}
              </p>
            )}
            {emailState === 'error' && (
              <p className="admin-users__form-error">
                {t('admin.eventEditor.security.credentialEmailError')}
              </p>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
