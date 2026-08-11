import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AtSign, Lock, MailCheck, UserCog, X } from 'lucide-react'
import { Field } from '../ui/FormFields.jsx'
import Button from '../ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * Mi cuenta: lo único que un integrante del staff administra de sí mismo desde
 * el panel. Hoy es el cambio de email, que va en dos pasos -- acá sólo se pide;
 * el cambio se aplica cuando se confirma el link que llega a la casilla nueva
 * (ver `StaffEmailChangePage`).
 *
 * Se pide la contraseña actual porque el email es la identidad de login: la
 * sesión sola no alcanza para moverla en una cuenta con permisos de panel.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function AccountDialog({ session, onRequestEmailChange, onClose }) {
  const { t } = useI18n()
  const titleId = useId()
  const panelRef = useRef(null)
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const dialogStateRef = useRef({ isSubmitting, onClose })
  dialogStateRef.current = { isSubmitting, onClose }

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector('input')?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !dialogStateRef.current.isSubmitting) {
        event.preventDefault()
        dialogStateRef.current.onClose()
        return
      }

      if (event.key !== 'Tab') return
      const focusable =
        panelRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled)') ?? []
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus?.()
    }
  }, [])

  function validate() {
    const next = {}
    const normalized = email.trim().toLowerCase()
    if (!EMAIL_RE.test(normalized)) next.email = t('staffAccount.errorEmailInvalid')
    else if (normalized === session?.email) next.email = t('staffAccount.errorEmailSame')
    if (!currentPassword) next.currentPassword = t('staffAccount.errorCurrentRequired')
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitError('')
    setPendingEmail('')
    if (!validate()) return

    setIsSubmitting(true)
    try {
      const result = await onRequestEmailChange({
        email: email.trim().toLowerCase(),
        currentPassword,
      })
      setPendingEmail(result?.pendingEmail ?? email.trim().toLowerCase())
      setCurrentPassword('')
      setEmail('')
    } catch (error) {
      setSubmitError(
        error?.status === 409
          ? t('staffAccount.errorEmailTaken')
          : error?.message || t('staffAccount.errorGeneric'),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return createPortal(
    <div className="admin-account-dialog">
      <button
        type="button"
        className="admin-account-dialog__backdrop"
        aria-label={t('common.cancel')}
        disabled={isSubmitting}
        onClick={onClose}
      />
      <section
        ref={panelRef}
        className="admin-account-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="admin-account-dialog__head">
          <span className="admin-account-dialog__icon" aria-hidden>
            <UserCog size={19} />
          </span>
          <div className="admin-account-dialog__copy">
            <span className="admin-account-dialog__eyebrow">{t('staffAccount.dialogEyebrow')}</span>
            <h2 id={titleId}>{session?.name || session?.email}</h2>
            <p>{t('staffAccount.dialogLead')}</p>
          </div>
          <button
            type="button"
            className="admin-account-dialog__close"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label={t('common.cancel')}
          >
            <X size={16} />
          </button>
        </header>

        <dl className="admin-account-dialog__meta">
          <div>
            <dt>{t('staffAccount.currentEmail')}</dt>
            <dd>{session?.email}</dd>
          </div>
          <div>
            <dt>{t('admin.columns.role')}</dt>
            <dd>{session?.roleLabel || session?.roleKey || session?.role}</dd>
          </div>
        </dl>

        {pendingEmail ? (
          <p className="admin-account-dialog__notice" role="status">
            <MailCheck size={15} aria-hidden />
            <span>{t('staffAccount.pendingNotice', { email: pendingEmail })}</span>
          </p>
        ) : null}

        <form className="admin-account-dialog__form" onSubmit={handleSubmit} noValidate>
          <Field
            label={t('staffAccount.newEmail')}
            name="email"
            type="email"
            icon={AtSign}
            value={email}
            error={fieldErrors.email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nombre@pluarg.com.ar"
            autoComplete="email"
          />
          <Field
            label={t('staffAccount.currentPassword')}
            name="currentPassword"
            type="password"
            icon={Lock}
            value={currentPassword}
            error={fieldErrors.currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder="••••••••••••"
            autoComplete="current-password"
          />

          {submitError ? (
            <p className="admin-account-dialog__error" role="alert">
              {submitError}
            </p>
          ) : null}

          <div className="admin-account-dialog__actions">
            <Button type="button" variant="secondary" disabled={isSubmitting} onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="gold" disabled={isSubmitting}>
              {isSubmitting ? t('staffAccount.sending') : t('staffAccount.sendEmailChange')}
            </Button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  )
}
