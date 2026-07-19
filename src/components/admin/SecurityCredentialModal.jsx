import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Mail, ShieldCheck, X } from 'lucide-react'
import { generateCredentialQr } from '../../lib/credentialQr.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * Card de credencial de acceso de una cuenta de seguridad: muestra el QR y
 * el link (con token firmado) que deja entrar a la puerta sin contraseña,
 * con opción de copiar o enviar por email. La generación del token vive en
 * el backend (onGenerate) — acá sólo lo pintamos.
 */
export default function SecurityCredentialModal({ user, onGenerate, onClose }) {
  const { t } = useI18n()
  const [state, setState] = useState({ status: 'loading', url: '', expiresAt: null, qr: '' })
  const [copied, setCopied] = useState(false)
  const [emailState, setEmailState] = useState('idle') // idle | sending | sent | error
  const requestedRef = useRef(false)

  useEffect(() => {
    if (requestedRef.current) return
    requestedRef.current = true
    let active = true
    onGenerate(false)
      .then(async ({ url, expiresAt }) => {
        const qr = await generateCredentialQr(url)
        if (active) setState({ status: 'ready', url, expiresAt, qr })
      })
      .catch(() => {
        if (active) setState((current) => ({ ...current, status: 'error' }))
      })
    return () => {
      active = false
    }
  }, [onGenerate])

  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(state.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Sin clipboard el link ya queda visible para copiar a mano.
    }
  }

  async function handleEmail() {
    setEmailState('sending')
    try {
      const { emailed } = await onGenerate(true)
      setEmailState(emailed ? 'sent' : 'error')
    } catch {
      setEmailState('error')
    }
  }

  const expiryLabel = state.expiresAt ? new Date(state.expiresAt).toLocaleDateString() : ''

  return createPortal(
    <div className="security-credential-modal">
      <button
        type="button"
        className="security-credential-modal__backdrop"
        aria-label={t('common.cancel')}
        onClick={onClose}
      />
      <div
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
          <p className="security-credential-modal__note">{t('admin.eventEditor.security.credentialLoading')}</p>
        )}
        {state.status === 'error' && (
          <p className="admin-users__form-error">{t('admin.eventEditor.security.credentialError')}</p>
        )}

        {state.status === 'ready' && (
          <>
            <div className="security-credential-modal__qr">
              <img src={state.qr} alt={t('admin.eventEditor.security.credentialQrAlt')} />
            </div>
            <p className="security-credential-modal__lead">{t('admin.eventEditor.security.credentialLead')}</p>

            <div className="security-credential-modal__link">
              <code>{state.url}</code>
              <button
                type="button"
                className={`admin-event-security__copy${copied ? ' admin-event-security__copy--done' : ''}`}
                onClick={handleCopy}
              >
                {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
                {copied ? t('admin.eventEditor.security.copied') : t('admin.eventEditor.security.copyLink')}
              </button>
            </div>

            {expiryLabel && (
              <p className="security-credential-modal__expiry">
                {t('admin.eventEditor.security.credentialExpiry', { date: expiryLabel })}
              </p>
            )}

            <div className="security-credential-modal__actions">
              <button
                type="button"
                className="admin-event-security__toggle admin-event-security__toggle--celeste"
                onClick={handleEmail}
                disabled={emailState === 'sending' || emailState === 'sent'}
              >
                <Mail size={13} aria-hidden />
                {emailState === 'sending'
                  ? t('admin.users.creating')
                  : emailState === 'sent'
                    ? t('admin.eventEditor.security.emailSent')
                    : t('admin.eventEditor.security.credentialEmail')}
              </button>
            </div>
            {emailState === 'error' && (
              <p className="admin-users__form-error">{t('admin.eventEditor.security.credentialEmailError')}</p>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
