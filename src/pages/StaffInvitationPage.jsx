import { useState } from 'react'
import { AlertCircle, ArrowLeft, ArrowRight, Eye, EyeOff, Lock } from 'lucide-react'
import '../styles/pages/design-phase2.css'
import authVisualPhoto from '../assets/DSC00286-display.jpg'
import BrandLogo from '../components/ui/BrandLogo.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'

const MIN_PASSWORD_LENGTH = 12

export default function StaffInvitationPage({ token, onAccept, onCancel }) {
  const { t } = useI18n()
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  function validate() {
    const next = {}
    if (password.length < MIN_PASSWORD_LENGTH) next.password = t('staffAccount.errorPasswordShort')
    if (!passwordConfirm) next.passwordConfirm = t('staffAccount.errorConfirmRequired')
    else if (password !== passwordConfirm)
      next.passwordConfirm = t('staffAccount.errorPasswordMismatch')
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitError('')
    if (!validate()) return

    setIsSubmitting(true)
    try {
      await onAccept({ token, password })
    } catch (error) {
      setSubmitError(error?.message || t('staffAccount.invitationError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="page auth-layout">
      <aside className="auth-layout__visual" aria-hidden="true">
        <img
          className="auth-layout__visual-photo"
          src={authVisualPhoto}
          alt=""
          width={800}
          height={1200}
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
        <div className="auth-layout__visual-scrim" />
        <div className="auth-layout__visual-content">
          <BrandLogo variant="letterhead" height={40} imgClassName="auth-layout__emblem" />
          <h2 className="auth-layout__slogan">
            {t('login.visualSlogan')}
            <span className="auth-layout__slogan-line">{t('login.visualSloganAccent')}</span>
          </h2>
          <p className="auth-layout__lead">{t('login.visualLead')}</p>
          <span className="auth-layout__rule" aria-hidden="true" />
          <p className="auth-layout__meta">{t('login.visualMeta')}</p>
        </div>
      </aside>

      <section className="auth-layout__content">
        <div className="auth-immersive-page">
          <div className="auth-immersive-glass" aria-labelledby="staff-invitation-heading">
            <header className="auth-immersive-glass__header">
              <BrandLogo
                variant="letterhead"
                imgClassName="auth-immersive-glass__logo"
                height={32}
              />
              <div className="auth-immersive-glass__copy">
                <span className="auth-immersive-glass__eyebrow">
                  {t('staffAccount.invitationEyebrow')}
                </span>
                <h1 id="staff-invitation-heading" className="auth-immersive-glass__title">
                  {t('staffAccount.invitationTitle')}
                </h1>
                <p className="auth-immersive-glass__lead">{t('staffAccount.invitationLead')}</p>
              </div>
            </header>

            <form className="login-form" onSubmit={handleSubmit} noValidate>
              <div className={`login-field${fieldErrors.password ? ' is-invalid' : ''}`}>
                <label htmlFor="staff-invitation-password" className="login-field__label">
                  {t('staffAccount.newPassword')}
                </label>
                <span className="login-field__control">
                  <Lock size={16} className="login-field__icon" aria-hidden />
                  <input
                    id="staff-invitation-password"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="new-password"
                    autoFocus
                    aria-invalid={Boolean(fieldErrors.password)}
                    required
                  />
                  <button
                    type="button"
                    className="login-field__toggle"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </span>
                {fieldErrors.password ? (
                  <span className="login-field__error" role="alert">
                    <AlertCircle size={14} className="error-icon" />
                    <span>{fieldErrors.password}</span>
                  </span>
                ) : null}
              </div>

              <label className={`login-field${fieldErrors.passwordConfirm ? ' is-invalid' : ''}`}>
                <span className="login-field__label">{t('staffAccount.confirmPassword')}</span>
                <span className="login-field__control">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="passwordConfirm"
                    value={passwordConfirm}
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="new-password"
                    aria-invalid={Boolean(fieldErrors.passwordConfirm)}
                    required
                  />
                </span>
                {fieldErrors.passwordConfirm ? (
                  <span className="login-field__error" role="alert">
                    <AlertCircle size={14} className="error-icon" />
                    <span>{fieldErrors.passwordConfirm}</span>
                  </span>
                ) : null}
              </label>

              <button type="submit" className="login-submit" disabled={isSubmitting}>
                {isSubmitting
                  ? t('staffAccount.invitationSubmitting')
                  : t('staffAccount.invitationSubmit')}
                {!isSubmitting && <ArrowRight size={16} aria-hidden />}
              </button>

              <p className="login-form__notice" role="note">
                {t('staffAccount.invitationHint', { min: MIN_PASSWORD_LENGTH })}
              </p>

              {submitError ? (
                <p className="form-submit-error" role="alert">
                  <AlertCircle size={14} className="error-icon" />
                  <span>{submitError}</span>
                </p>
              ) : null}

              <button type="button" className="login-form__back" onClick={onCancel}>
                <ArrowLeft size={14} aria-hidden />
                {t('staffAccount.invitationCancel')}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  )
}
