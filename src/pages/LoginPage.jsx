import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider.jsx'
import BrandLogo from '../components/ui/BrandLogo.jsx'
import { clearPasswordResetToken, readPasswordResetToken } from '../lib/passwordResetRoute.js'
import { usePluOAuth } from '../providers/oauthContext.js'
import { forgotAthletePassword, resetAthletePassword } from '../services/athleteApi.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase()
}

export default function LoginPage({ onLogin, onNavigate }) {
  const { t } = useI18n()
  const oauth = usePluOAuth()
  const initialResetToken = readPasswordResetToken()
  const [mode, setMode] = useState(initialResetToken ? 'reset' : 'login')
  const [resetToken, setResetToken] = useState(initialResetToken)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [recoverMessage, setRecoverMessage] = useState('')

  useEffect(() => {
    const token = readPasswordResetToken()
    if (!token) return
    setResetToken(token)
    setMode('reset')
  }, [])

  function clearErrors() {
    setSubmitError('')
    setFieldErrors({})
    setRecoverMessage('')
  }

  function openRecover() {
    clearErrors()
    setPassword('')
    setMode('recover')
  }

  function backToLogin() {
    clearErrors()
    setPassword('')
    setPasswordConfirm('')
    setResetToken(null)
    clearPasswordResetToken()
    setMode('login')
  }

  function validateLogin() {
    const next = {}
    const raw = String(email ?? '').trim()
    const normalized = raw.toLowerCase()
    if (!normalized) next.email = t('login.errorEmailRequired')
    else if (normalized.includes('@') && !EMAIL_RE.test(normalized)) next.email = t('login.errorEmailInvalid')
    if (!password) next.password = t('login.errorPasswordRequired')
    else if (password.length < 3) next.password = t('login.errorPasswordRequired')
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  function validateRecover() {
    const next = {}
    const normalized = normalizeEmail(email)
    if (!normalized) next.email = t('login.errorEmailRequired')
    else if (!EMAIL_RE.test(normalized)) next.email = t('login.errorEmailInvalid')
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  function validateReset() {
    const next = {}
    if (!password) next.password = t('login.errorPasswordRequired')
    else if (password.length < 12) next.password = t('login.errorPasswordResetShort')
    if (!passwordConfirm) next.passwordConfirm = t('login.errorPasswordConfirmRequired')
    else if (password !== passwordConfirm) next.passwordConfirm = t('login.errorPasswordMismatch')
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function enter(credentialsOrType) {
    const session = await onLogin(credentialsOrType)
    onNavigate(session.role === 'athlete_plu' ? 'profile' : 'admin')
  }

  async function handleLoginSubmit(event) {
    event.preventDefault()
    clearErrors()
    if (!validateLogin()) return

    setIsSubmitting(true)
    try {
      await enter({ email: normalizeEmail(email), password })
    } catch (error) {
      setSubmitError(error?.status === 0 ? error.message : t('login.errorInvalid'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRecoverSubmit(event) {
    event.preventDefault()
    clearErrors()
    if (!validateRecover()) return

    setIsSubmitting(true)
    try {
      const result = await forgotAthletePassword(normalizeEmail(email))
      setRecoverMessage(result?.message || t('login.forgotSentDesc'))
      setMode('recoverSent')
    } catch (error) {
      setSubmitError(error?.message || t('login.forgotError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResetSubmit(event) {
    event.preventDefault()
    clearErrors()
    if (!validateReset()) return
    if (!resetToken) {
      setSubmitError(t('login.resetInvalid'))
      return
    }

    setIsSubmitting(true)
    try {
      await resetAthletePassword({ token: resetToken, password })
      clearPasswordResetToken()
      setPassword('')
      setPasswordConfirm('')
      setResetToken(null)
      setRecoverMessage(t('login.resetSuccess'))
      setMode('login')
    } catch (error) {
      setSubmitError(error?.message || t('login.resetError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleOAuthLogin() {
    clearErrors()
    try {
      await oauth.login()
    } catch {
      setSubmitError(t('login.errorOAuth'))
    }
  }

  const cardTitle =
    mode === 'recover' || mode === 'recoverSent'
      ? t('login.forgotTitle')
      : mode === 'reset'
        ? t('login.resetTitle')
        : t('login.title')

  const cardLead =
    mode === 'recover'
      ? t('login.forgotLead')
      : mode === 'recoverSent'
        ? t('login.forgotSentLead')
        : mode === 'reset'
          ? t('login.resetLead')
          : t('login.subtitle')

  return (
    <main className="page auth-layout">
      <aside className="auth-layout__visual" aria-hidden="true">
        <div className="auth-layout__visual-content">
          <BrandLogo variant="letterhead" height={40} imgClassName="auth-layout__emblem" />
          <h2 className="auth-layout__slogan">
            Elevá tu
            <span className="auth-layout__slogan-line">estándar.</span>
          </h2>
          <p className="auth-layout__lead">
            Perfil, afiliación e historial competitivo en un solo lugar.
          </p>
          <span className="auth-layout__rule" aria-hidden="true" />
          <ul className="auth-layout__signals">
            <li>Credencial digital PLU</li>
            <li>Historial oficial</li>
            <li>Inscripciones a eventos</li>
          </ul>
          <p className="auth-layout__meta">Powerlifting United Argentina</p>
        </div>
      </aside>
      <section className="auth-layout__content">
        <div className="auth-immersive-page">
          <div className="auth-immersive-glass" aria-labelledby="login-heading">
        <header className="auth-immersive-glass__header">
          <BrandLogo variant="letterhead" imgClassName="auth-immersive-glass__logo" height={36} />
          <div className="auth-immersive-glass__copy">
            <h1 id="login-heading" className="auth-immersive-glass__title">{cardTitle}</h1>
            <p className="auth-immersive-glass__lead">{cardLead}</p>
          </div>
        </header>

          {mode === 'login' && (
            <form className="login-form" onSubmit={handleLoginSubmit} noValidate>
              <label className={`login-field${fieldErrors.email ? ' is-invalid' : ''}`}>
                <span className="login-field__label">{t('login.email')}</span>
                <span className="login-field__control">
                  <input
                    type="text"
                    name="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={t('login.emailPlaceholder')}
                    autoComplete="username"
                    autoFocus
                    aria-invalid={Boolean(fieldErrors.email)}
                    required
                  />
                </span>
                {fieldErrors.email ? (
                  <span className="login-field__error" role="alert">
                    <AlertCircle size={14} className="error-icon" />
                    <span>{fieldErrors.email}</span>
                  </span>
                ) : null}
              </label>

              {/* div + htmlFor: no anidar forgot/toggle en un <label> — el click del
                  ojo activaba el primer labelable (olvidaste) y abría recover. */}
              <div className={`login-field${fieldErrors.password ? ' is-invalid' : ''}`}>
                <span className="login-field__row">
                  <label htmlFor="login-password" className="login-field__label">
                    {t('login.password')}
                  </label>
                  <button type="button" className="login-field__forgot" onClick={openRecover}>
                    {t('login.forgot')}
                  </button>
                </span>
                <span className="login-field__control">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
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

              <button type="submit" className="login-submit" disabled={isSubmitting}>
                {isSubmitting ? t('login.submitting') : t('login.submit')}
                {!isSubmitting && <ArrowRight size={16} aria-hidden />}
              </button>
              {recoverMessage ? (
                <p className="login-form__notice" role="status">
                  {recoverMessage}
                </p>
              ) : null}
              {submitError ? (
                <p className="form-submit-error" role="alert">
                  <AlertCircle size={14} className="error-icon" />
                  <span>{submitError}</span>
                </p>
              ) : null}
            </form>
          )}

          {mode === 'recover' && (
            <form className="login-form" onSubmit={handleRecoverSubmit} noValidate>
              <label className={`login-field${fieldErrors.email ? ' is-invalid' : ''}`}>
                <span className="login-field__label">{t('login.email')}</span>
                <span className="login-field__control">
                  <input
                    type="email"
                    name="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={t('login.forgotEmailPlaceholder')}
                    autoComplete="email"
                    autoFocus
                    aria-invalid={Boolean(fieldErrors.email)}
                    required
                  />
                </span>
                {fieldErrors.email ? (
                  <span className="login-field__error" role="alert">
                    <AlertCircle size={14} className="error-icon" />
                    <span>{fieldErrors.email}</span>
                  </span>
                ) : null}
              </label>

              <button type="submit" className="login-submit" disabled={isSubmitting}>
                {isSubmitting ? t('login.forgotSubmitting') : t('login.forgotSubmit')}
                {!isSubmitting && <ArrowRight size={16} aria-hidden />}
              </button>

              <button type="button" className="login-form__back" onClick={backToLogin}>
                <ArrowLeft size={14} aria-hidden />
                {t('login.backToLogin')}
              </button>

              {submitError ? (
                <p className="form-submit-error" role="alert">
                  <AlertCircle size={14} className="error-icon" />
                  <span>{submitError}</span>
                </p>
              ) : null}
            </form>
          )}

          {mode === 'recoverSent' && (
            <div className="login-form login-form--sent">
              <p className="login-form__notice" role="status">
                {recoverMessage || t('login.forgotSentDesc')}
              </p>
              <p className="login-form__hint">{t('login.forgotSentHint')}</p>
              <button type="button" className="login-submit" onClick={backToLogin}>
                {t('login.backToLogin')}
              </button>
            </div>
          )}

          {mode === 'reset' && (
            <form className="login-form" onSubmit={handleResetSubmit} noValidate>
              <label className={`login-field${fieldErrors.password ? ' is-invalid' : ''}`}>
                <span className="login-field__label">{t('login.newPassword')}</span>
                <span className="login-field__control">
                  <input
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
              </label>

              <label className={`login-field${fieldErrors.passwordConfirm ? ' is-invalid' : ''}`}>
                <span className="login-field__label">{t('login.confirmPassword')}</span>
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
                {isSubmitting ? t('login.resetSubmitting') : t('login.resetSubmit')}
                {!isSubmitting && <ArrowRight size={16} aria-hidden />}
              </button>

              <button type="button" className="login-form__back" onClick={backToLogin}>
                <ArrowLeft size={14} aria-hidden />
                {t('login.backToLogin')}
              </button>

              {submitError ? (
                <p className="form-submit-error" role="alert">
                  <AlertCircle size={14} className="error-icon" />
                  <span>{submitError}</span>
                </p>
              ) : null}
            </form>
          )}

          {mode === 'login' && oauth.configured && (
            <>
              <div className="login-separator" role="separator">
                <span>{t('login.separator')}</span>
              </div>
              <button
                type="button"
                className="login-submit login-submit--oauth"
                onClick={handleOAuthLogin}
                disabled={oauth.isLoading}
              >
                {oauth.isLoading ? t('login.oauthLoading') : t('login.oauthSubmit')}
              </button>
            </>
          )}

          {mode === 'login' && (
            <p className="login-join">
              {t('login.joinPrompt')}{' '}
              <button type="button" className="login-join__link" onClick={() => onNavigate('members')}>
                {t('login.joinLink')}
              </button>
            </p>
          )}
        </div>
        
        <p className="login-page__footer auth-layout__footer">
          {t('login.footerNote')} ·{' '}
          <button type="button" onClick={() => onNavigate('home')}>
            {t('login.backToSite')}
          </button>
        </p>
        </div>
      </section>
    </main>
  )
}
