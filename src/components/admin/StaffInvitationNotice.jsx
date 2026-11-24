import { useEffect, useRef, useState } from 'react'
import { Check, Copy, MessageCircle, X } from 'lucide-react'
import Button from '../ui/Button.jsx'
import '../../styles/pages/admin-users.css'

function formatExpiry(value, locale) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-AR', {
    day: 'numeric',
    month: 'long',
  }).format(date)
}

// Resultado de un alta o de una invitación reemitida. El enlace es la pieza
// principal: se copia con un toque o se manda directo por WhatsApp. El mail es
// un canal más, no el único. Las cuentas de seguridad siguen mostrando su clave
// temporal (no tienen enlace). Lo usan Usuarios y la ficha del atleta, por eso
// el estado de "copiado" vive acá y no en quien lo monta.
export default function StaffInvitationNotice({ info, locale, onDismiss, t }) {
  const linkRef = useRef(null)
  const resetTimer = useRef(null)
  const [copyState, setCopyState] = useState('idle')
  const isSecurity = info.mode === 'security'
  const expiry = info.expiresAt ? formatExpiry(info.expiresAt, locale) : ''
  const whatsappHref = info.invitationUrl
    ? `https://wa.me/?text=${encodeURIComponent(
        info.open
          ? t('admin.users.whatsappMessageOpen', { url: info.invitationUrl })
          : t('admin.users.whatsappMessage', { name: info.name ?? '', url: info.invitationUrl }),
      )}`
    : null

  useEffect(() => () => window.clearTimeout(resetTimer.current), [])

  async function handleCopy() {
    if (!info.invitationUrl) return
    try {
      await navigator.clipboard.writeText(info.invitationUrl)
      setCopyState('copied')
      window.clearTimeout(resetTimer.current)
      resetTimer.current = window.setTimeout(() => setCopyState('idle'), 2400)
    } catch {
      // Sin permiso de portapapeles: se deja el enlace seleccionado para Ctrl+C.
      linkRef.current?.select()
      setCopyState('failed')
    }
  }

  return (
    <div className="admin-users__credential" role="status">
      <div className="admin-users__credential-head">
        <p className="admin-users__credential-title">
          {isSecurity
            ? t('admin.users.tempPasswordTitle')
            : info.mode === 'reset'
              ? t('admin.users.resetTitle')
              : info.open
                ? t('admin.users.openInviteTitle')
                : t('admin.users.inviteTitle')}
        </p>
        <button
          type="button"
          className="admin-users__credential-close"
          aria-label={t('admin.users.dismiss')}
          onClick={onDismiss}
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      <dl className="admin-users__credential-meta">
        {info.open ? (
          <div>
            <dt>{t('admin.columns.role')}</dt>
            <dd>{info.roleName}</dd>
          </div>
        ) : (
          <div>
            <dt>{t('admin.users.email')}</dt>
            <dd>{info.email}</dd>
          </div>
        )}
        {info.password ? (
          <div>
            <dt>{t('admin.users.tempPasswordLabel')}</dt>
            <dd>
              <code>{info.password}</code>
            </dd>
          </div>
        ) : null}
      </dl>

      {info.invitationUrl ? (
        <div className="admin-users__invite-link">
          <label className="admin-users__invite-field">
            <span className="admin-users__invite-label">{t('admin.users.linkLabel')}</span>
            <input
              ref={linkRef}
              type="text"
              readOnly
              value={info.invitationUrl}
              onFocus={(event) => event.target.select()}
            />
          </label>
          <div className="admin-users__invite-actions">
            <Button
              type="button"
              variant="gold"
              className="btn--small"
              onClick={() => void handleCopy()}
            >
              {copyState === 'copied' ? (
                <Check size={14} aria-hidden />
              ) : (
                <Copy size={14} aria-hidden />
              )}
              <span>
                {copyState === 'copied' ? t('admin.users.linkCopied') : t('admin.users.copyLink')}
              </span>
            </Button>
            <a
              className="admin-users__link"
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={15} aria-hidden />
              <span>{t('admin.users.shareWhatsapp')}</span>
            </a>
          </div>
          <p className="admin-users__credential-note" aria-live="polite">
            {copyState === 'failed' ? t('admin.users.copyFailed') : null}
          </p>
        </div>
      ) : null}

      <p className="admin-users__credential-note">
        {isSecurity
          ? t('admin.users.tempPasswordWarn')
          : info.emailed
            ? t('admin.users.credentialEmailed', { email: info.email })
            : info.emailRequested
              ? t('admin.users.credentialNotEmailed')
              : null}
      </p>
      {info.invitationUrl ? (
        <p className="admin-users__credential-note">
          {info.open
            ? t('admin.users.linkNoteOpen')
            : t('admin.users.linkNote', { email: info.email })}
          {expiry ? ` ${t('admin.users.linkExpires', { date: expiry })}` : ''}
        </p>
      ) : null}
    </div>
  )
}
