import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Eye,
  EyeOff,
  HelpCircle,
  AlertCircle,
  Mail,
  Lock,
} from 'lucide-react'
import '../styles/pages/design-phase2.css'
import authVisualPhoto from '../assets/DSC00286-display.jpg'
import authVisualPhotoAvif from '../assets/DSC00286-display.avif'
import authVisualPhotoAvif480 from '../assets/DSC00286-display-480.avif'
import authVisualPhotoAvif800 from '../assets/DSC00286-display-800.avif'
import authVisualPhotoWebp from '../assets/DSC00286-display.webp'
import authVisualPhotoWebp480 from '../assets/DSC00286-display-480.webp'
import authVisualPhotoWebp800 from '../assets/DSC00286-display-800.webp'
import { useI18n } from '../i18n/I18nProvider.jsx'
import BrandLogo from '../components/ui/BrandLogo.jsx'
import ResponsivePhoto from '../components/ui/ResponsivePhoto.jsx'
import MotionContentSwap from '../motion/MotionContentSwap.tsx'
import { clearPasswordResetToken, readPasswordResetToken } from '../lib/passwordResetRoute.js'
import { usePluOAuth } from '../providers/oauthContext.js'
import { forgotAthletePassword, resetAthletePassword } from '../services/athleteApi.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeEmail(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

/**
 * CTA con estado ocupado real: la etiqueta cambia y el spinner reemplaza a la
 * flecha sin alterar el ancho del botón, así el submit no "salta" al enviar.
 */
function AuthSubmit({ busy, busyLabel, className = '', label, ...props }) {
  return (
    <button
      type="submit"
      className={`login-submit${className ? ` ${className}` : ''}`}
      aria-busy={busy || undefined}
      disabled={busy}
      {...props}
    >
      <span className="login-submit__label">{busy ? busyLabel : label}</span>
      <span className="login-submit__mark" aria-hidden>
        {busy ? <span className="plu-spinner" /> : <ArrowRight size={16} />}
      </span>
    </button>
  )
}

/**
 * Guía de acceso: los tres caminos reales para entrar (ficha propia, clave
 * temporal, todavía sin cuenta). Disclosure editorial — no tooltip-tour: la
 * persona que llega sin saber si tiene cuenta necesita el mapa completo a un
 * toque, no un carrusel. Los pasos con acción la llevan directo al flujo
 * (recuperar acceso / afiliarse) sin salir del login.
 */
function LoginAccessGuide({ onRecover, onJoin }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const panelId = 'login-access-guide'

  const steps = [
    { n: '01', title: t('login.howToStep1Title'), body: t('login.howToStep1Body') },
    {
      n: '02',
      title: t('login.howToStep2Title'),
      body: t('login.howToStep2Body'),
      action: onRecover,
      actionLabel: t('login.howToStep2Action'),
    },
    {
      n: '03',
      title: t('login.howToStep3Title'),
      body: t('login.howToStep3Body'),
      action: onJoin,
      actionLabel: t('login.howToStep3Action'),
    },
  ]

  return (
    <div className="login-guide" data-open={open ? '1' : '0'}>
      <button
        type="button"
        className="login-guide__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <HelpCircle size={14} aria-hidden />
        <span>{t('login.howToToggle')}</span>
        <ChevronDown size={14} className="login-guide__chevron" aria-hidden />
      </button>

      <div
        id={panelId}
        className="login-guide__panel"
        role="region"
        aria-label={t('login.howToTitle')}
      >
        <div className="login-guide__panel-inner">
          <p className="login-guide__title">{t('login.howToTitle')}</p>
          <ol className="login-guide__steps">
            {steps.map(({ n, title, body, action, actionLabel }) => (
              <li key={n} className="login-guide__step">
                <span className="login-guide__step-n" aria-hidden>
                  {n}
                </span>
                <div className="login-guide__step-copy">
                  <p className="login-guide__step-title">{title}</p>
                  <p className="login-guide__step-body">{body}</p>
                  {action ? (
                    <button type="button" className="login-guide__step-action" onClick={action}>
                      {actionLabel}
                      <ArrowRight size={13} aria-hidden />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage({ onLogin, onNavigate }) {
  const { t } = useI18n()
  const oauth = usePluOAuth()
  const initialResetToken = readPasswordResetToken()
  const [mode, setMode] = useState(initialResetToken ? 'reset' : 'login')
  const [swapDirection, setSwapDirection] = useState(1)
  const [resetToken, setResetToken] = useState(initialResetToken)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
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

  // Bloq Mayús con la contraseña oculta es la causa silenciosa más común de
  // "credenciales inválidas": se avisa mientras se tipea, no después de fallar.
  function trackCapsLock(event) {
    const state = event.getModifierState?.('CapsLock')
    if (typeof state === 'boolean') setCapsLock(state)
  }

  function openRecover() {
    clearErrors()
    setPassword('')
    setCapsLock(false)
    setSwapDirection(1)
    setMode('recover')
  }

  function backToLogin() {
    clearErrors()
    setPassword('')
    setPasswordConfirm('')
    setCapsLock(false)
    setResetToken(null)
    clearPasswordResetToken()
    setSwapDirection(-1)
    setMode('login')
  }

  function validateLogin() {
    const next = {}
    const raw = String(email ?? '').trim()
    const normalized = raw.toLowerCase()
    if (!normalized) next.email = t('login.errorEmailRequired')
    else if (normalized.includes('@') && !EMAIL_RE.test(normalized))
      next.email = t('login.errorEmailInvalid')
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
      // Un 429 no es una credencial mal puesta: mostrarlo como tal hacía que
      // el atleta cambiara una contraseña que estaba bien. 502/503 (API caída
      // o proxy de Vite sin backend) tampoco: el mensaje genérico de
      // "revisá email/contraseña" escondía que el servicio no estaba arriba.
      const status = error?.status
      const showsServerMessage = status === 0 || status === 429 || status === 502 || status === 503
      setSubmitError(
        showsServerMessage ? error.message || t('login.errorUnavailable') : t('login.errorInvalid'),
      )
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
      const sentTo = normalizeEmail(email)
      setRecoverMessage(result?.message || t('login.forgotSentDesc', { email: sentTo }))
      setSwapDirection(1)
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
      setSwapDirection(-1)
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

  const cardEyebrow =
    mode === 'recover' || mode === 'recoverSent' || mode === 'reset'
      ? t('login.recoverEyebrow')
      : t('login.eyebrow')

  const cardTitle =
    mode === 'recoverSent'
      ? t('login.forgotSentTitle')
      : mode === 'recover'
        ? t('login.forgotTitle')
        : mode === 'reset'
          ? t('login.resetTitle')
          : t('login.title')

  const cardLead =
    mode === 'recoverSent'
      ? t('login.forgotSentLead')
      : mode === 'recover'
        ? t('login.forgotLead')
        : mode === 'reset'
          ? t('login.resetLead')
          : t('login.subtitle')

  const capsLockHint = capsLock ? (
    <span className="login-field__hint" role="status">
      <AlertCircle size={13} aria-hidden />
      <span>{t('login.capsLock')}</span>
    </span>
  ) : null

  return (
    <main className="page auth-layout">
      <aside className="auth-layout__visual" aria-hidden="true">
        <ResponsivePhoto
          className="auth-layout__visual-photo"
          avif={{
            480: authVisualPhotoAvif480,
            800: authVisualPhotoAvif800,
            1153: authVisualPhotoAvif,
          }}
          webp={{
            480: authVisualPhotoWebp480,
            800: authVisualPhotoWebp800,
            1153: authVisualPhotoWebp,
          }}
          src={authVisualPhoto}
          alt=""
          width={800}
          height={1200}
          sizes="(min-width: 1024px) 45vw, 30vw"
          loading="eager"
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
          <ul className="auth-layout__signals">
            <li>{t('login.featureProfile')}</li>
            <li>{t('login.featureMembership')}</li>
            <li>{t('login.featureEvents')}</li>
          </ul>
          <p className="auth-layout__meta">{t('login.visualMeta')}</p>
        </div>
      </aside>
      <section className="auth-layout__content">
        <div className="auth-immersive-page">
          <div
            className={`auth-immersive-glass${mode === 'recoverSent' ? ' auth-immersive-glass--confirm' : ''}`}
            aria-labelledby="login-heading"
          >
            <header className="auth-immersive-glass__header">
              <BrandLogo
                variant="letterhead"
                imgClassName="auth-immersive-glass__logo"
                height={32}
              />
              <div className="auth-immersive-glass__copy">
                <span className="auth-immersive-glass__eyebrow">{cardEyebrow}</span>
                {/* key por modo: React reemplaza el nodo y la animación CSS de
                entrada vuelve a correr sin montar un AnimatePresence extra
                (que dejaría dos h1 con el mismo id durante el crossfade). */}
                <h1
                  key={`title-${mode}`}
                  id="login-heading"
                  className="auth-immersive-glass__title"
                >
                  {cardTitle}
                </h1>
                <p key={`lead-${mode}`} className="auth-immersive-glass__lead">
                  {cardLead}
                </p>
              </div>
            </header>

            <div className="auth-mode-swap">
              <MotionContentSwap
                className="auth-mode-swap__panel"
                direction={swapDirection}
                mode="sync"
                swapKey={mode}
              >
                {mode === 'login' && (
                  <form className="login-form" onSubmit={handleLoginSubmit} noValidate>
                    <label className={`login-field${fieldErrors.email ? ' is-invalid' : ''}`}>
                      <span className="login-field__label">{t('login.email')}</span>
                      <span className="login-field__control">
                        <Mail size={16} className="login-field__icon" aria-hidden />
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
                        <Lock size={16} className="login-field__icon" aria-hidden />
                        <input
                          id="login-password"
                          type={showPassword ? 'text' : 'password'}
                          name="password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          onKeyUp={trackCapsLock}
                          onKeyDown={trackCapsLock}
                          onBlur={() => setCapsLock(false)}
                          placeholder="••••••••"
                          autoComplete="current-password"
                          aria-invalid={Boolean(fieldErrors.password)}
                          required
                        />
                        <button
                          type="button"
                          className="login-field__toggle"
                          onClick={() => setShowPassword((visible) => !visible)}
                          aria-label={
                            showPassword ? t('login.hidePassword') : t('login.showPassword')
                          }
                          aria-pressed={showPassword}
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </span>
                      {capsLockHint}
                      {fieldErrors.password ? (
                        <span className="login-field__error" role="alert">
                          <AlertCircle size={14} className="error-icon" />
                          <span>{fieldErrors.password}</span>
                        </span>
                      ) : null}
                    </div>

                    <AuthSubmit
                      busy={isSubmitting}
                      busyLabel={t('login.submitting')}
                      label={t('login.submit')}
                    />

                    <LoginAccessGuide
                      onRecover={openRecover}
                      onJoin={() => onNavigate('members')}
                    />
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

                    {oauth.configured ? (
                      <>
                        <div className="login-separator" role="separator">
                          <span>{t('login.separator')}</span>
                        </div>
                        <button
                          type="button"
                          className="login-submit login-submit--oauth"
                          onClick={handleOAuthLogin}
                          disabled={oauth.isLoading}
                          aria-busy={oauth.isLoading || undefined}
                        >
                          <span className="login-submit__label">
                            {oauth.isLoading ? t('login.oauthLoading') : t('login.oauthSubmit')}
                          </span>
                          {oauth.isLoading ? (
                            <span className="login-submit__mark" aria-hidden>
                              <span className="plu-spinner" />
                            </span>
                          ) : null}
                        </button>
                      </>
                    ) : null}

                    <p className="login-join">
                      {t('login.joinPrompt')}{' '}
                      <button
                        type="button"
                        className="login-join__link"
                        onClick={() => onNavigate('members')}
                      >
                        {t('login.joinLink')}
                      </button>
                    </p>
                  </form>
                )}

                {mode === 'recover' && (
                  <form className="login-form" onSubmit={handleRecoverSubmit} noValidate>
                    <label className={`login-field${fieldErrors.email ? ' is-invalid' : ''}`}>
                      <span className="login-field__label">{t('login.email')}</span>
                      <span className="login-field__control">
                        <Mail size={16} className="login-field__icon" aria-hidden />
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

                    <AuthSubmit
                      busy={isSubmitting}
                      busyLabel={t('login.forgotSubmitting')}
                      label={t('login.forgotSubmit')}
                    />

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
                    <span className="login-form__mark" aria-hidden>
                      <Mail size={18} strokeWidth={1.75} />
                    </span>
                    <p className="login-form__notice" role="status">
                      {recoverMessage ||
                        t('login.forgotSentDesc', { email: normalizeEmail(email) })}
                    </p>
                    <p className="login-form__hint">{t('login.forgotSentHint')}</p>
                    <button type="button" className="login-submit" onClick={backToLogin}>
                      <span className="login-submit__label">{t('login.backToLogin')}</span>
                      <span className="login-submit__mark" aria-hidden>
                        <ArrowRight size={16} />
                      </span>
                    </button>
                  </div>
                )}

                {mode === 'reset' && (
                  <form className="login-form" onSubmit={handleResetSubmit} noValidate>
                    <label className={`login-field${fieldErrors.password ? ' is-invalid' : ''}`}>
                      <span className="login-field__label">{t('login.newPassword')}</span>
                      <span className="login-field__control">
                        <Lock size={16} className="login-field__icon" aria-hidden />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          name="password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          onKeyUp={trackCapsLock}
                          onKeyDown={trackCapsLock}
                          onBlur={() => setCapsLock(false)}
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
                          aria-label={
                            showPassword ? t('login.hidePassword') : t('login.showPassword')
                          }
                          aria-pressed={showPassword}
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </span>
                      {capsLockHint}
                      {fieldErrors.password ? (
                        <span className="login-field__error" role="alert">
                          <AlertCircle size={14} className="error-icon" />
                          <span>{fieldErrors.password}</span>
                        </span>
                      ) : null}
                    </label>

                    <label
                      className={`login-field${fieldErrors.passwordConfirm ? ' is-invalid' : ''}`}
                    >
                      <span className="login-field__label">{t('login.confirmPassword')}</span>
                      <span className="login-field__control">
                        <Lock size={16} className="login-field__icon" aria-hidden />
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

                    <AuthSubmit
                      busy={isSubmitting}
                      busyLabel={t('login.resetSubmitting')}
                      label={t('login.resetSubmit')}
                    />

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
              </MotionContentSwap>
            </div>
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
