import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MailCheck, X } from 'lucide-react'
import { Field } from '../ui/FormFields.jsx'
import Button from '../ui/Button.jsx'
import PreferenceChoice from '../ui/PreferenceChoice.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useTheme } from '../../providers/ThemeProvider.jsx'
import { TOUR_MODES, useAdminTour } from '../../providers/AdminTourProvider.jsx'
import { initials } from '../../lib/format.js'

/**
 * Mi cuenta: lo que un integrante del staff administra de sí mismo desde el
 * panel. Panel lateral con dos bloques:
 *
 * - Preferencias (idioma, tema, recorrido guiado): sólo del navegador, se
 *   aplican al instante y no pasan por la API.
 * - Seguridad: el cambio de email, que va en dos pasos -- acá sólo se pide; el
 *   cambio se aplica cuando se confirma el link que llega a la casilla nueva
 *   (ver `StaffEmailChangePage`).
 *
 * Se pide la contraseña actual porque el email es la identidad de login: la
 * sesión sola no alcanza para moverla en una cuenta con permisos de panel.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LOCALES = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
]
const THEME_CHOICES = ['light', 'dark']

export default function AccountDialog({ session, onRequestEmailChange, onClose }) {
  const { t, locale, setLocale } = useI18n()
  const { theme, setTheme } = useTheme()
  const { tourMode, setTourMode } = useAdminTour()
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
    panelRef.current?.querySelector('.admin-account__close')?.focus()

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

  const displayName = session?.name || session?.email

  return createPortal(
    <div className="admin-account">
      <button
        type="button"
        className="admin-account__backdrop"
        aria-label={t('common.cancel')}
        disabled={isSubmitting}
        onClick={onClose}
      />
      <section
        ref={panelRef}
        className="admin-account__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="admin-account__head">
          <span className="admin-account__avatar" aria-hidden>
            {initials(displayName)}
          </span>
          <div className="admin-account__identity">
            <span className="admin-account__eyebrow">{t('staffAccount.dialogEyebrow')}</span>
            <h2 id={titleId}>{displayName}</h2>
            <p>
              <span>{session?.roleLabel || session?.roleKey || session?.role}</span>
              <span aria-hidden> · </span>
              <span>{session?.email}</span>
            </p>
          </div>
          <button
            type="button"
            className="admin-account__close"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label={t('common.cancel')}
          >
            <X size={18} strokeWidth={1.5} aria-hidden />
          </button>
        </header>

        <div className="admin-account__body">
          <section className="admin-account__section" aria-label={t('staffAccount.preferencesTitle')}>
            <h3>{t('staffAccount.preferencesTitle')}</h3>
            <PreferenceChoice
              label={t('staffAccount.prefLanguage')}
              options={LOCALES}
              value={locale}
              onChange={setLocale}
            />
            <PreferenceChoice
              label={t('staffAccount.prefTheme')}
              options={THEME_CHOICES.map((value) => ({
                value,
                label: t(value === 'light' ? 'staffAccount.themeLight' : 'staffAccount.themeDark'),
              }))}
              value={theme}
              onChange={setTheme}
            />
            <PreferenceChoice
              label={t('staffAccount.prefTour')}
              options={TOUR_MODES.map((value) => ({
                value,
                label: t(`staffAccount.tour.${value}`),
              }))}
              value={tourMode}
              onChange={setTourMode}
            />
          </section>

          <section className="admin-account__section" aria-label={t('staffAccount.securityTitle')}>
            <h3>{t('staffAccount.securityTitle')}</h3>
            <p className="admin-account__lead">{t('staffAccount.dialogLead')}</p>

            {pendingEmail ? (
              <p className="admin-account__notice" role="status">
                <MailCheck size={16} strokeWidth={1.5} aria-hidden />
                <span>{t('staffAccount.pendingNotice', { email: pendingEmail })}</span>
              </p>
            ) : null}

            <form className="admin-account__form" onSubmit={handleSubmit} noValidate>
              <Field
                label={t('staffAccount.newEmail')}
                name="email"
                type="email"
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
                value={currentPassword}
                error={fieldErrors.currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="••••••••••••"
                autoComplete="current-password"
              />

              {submitError ? (
                <p className="admin-account__error" role="alert">
                  {submitError}
                </p>
              ) : null}

              <Button type="submit" variant="gold" disabled={isSubmitting}>
                {isSubmitting ? t('staffAccount.sending') : t('staffAccount.sendEmailChange')}
              </Button>
            </form>
          </section>
        </div>
      </section>
    </div>,
    document.body,
  )
}
