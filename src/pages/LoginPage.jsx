import { useState } from 'react'
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider.jsx'
import BrandLogo from '../components/ui/BrandLogo.jsx'
import { usePluOAuth } from '../providers/oauthContext.js'

const FEATURE_KEYS = ['login.featureProfile', 'login.featureMembership', 'login.featureEvents']

export default function LoginPage({ onLogin, onNavigate }) {
  const { t } = useI18n()
  const oauth = usePluOAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  async function enter(credentialsOrType) {
    const session = await onLogin(credentialsOrType)
    onNavigate(session.role === 'athlete_plu' ? 'profile' : 'admin')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitError('')
    setIsSubmitting(true)

    try {
      await enter({ email, password })
    } catch {
      setSubmitError(t('login.errorInvalid'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleOAuthLogin() {
    setSubmitError('')
    try {
      await oauth.login()
    } catch {
      setSubmitError(t('login.errorOAuth'))
    }
  }

  return (
    <main className="page login-page--design">
      <div className="login-shell">
        <section className="login-card" aria-labelledby="login-heading">
          <header className="login-card__header">
            <div className="login-card__logos">
              <BrandLogo variant="argentina" imgClassName="login-card__emblem" height={40} />
              <BrandLogo variant="letterhead" imgClassName="login-card__logo" height={28} />
            </div>
            <span className="login-card__eyebrow">
              <span className="login-card__eyebrow-dot" aria-hidden />
              {t('login.eyebrow')}
            </span>
            <h1 id="login-heading">{t('login.title')}</h1>
            <p className="login-card__lead">{t('login.subtitle')}</p>
          </header>

          {oauth.configured && (
            <button
              type="button"
              className="login-submit login-submit--oauth"
              onClick={handleOAuthLogin}
              disabled={oauth.isLoading}
            >
              {oauth.isLoading ? t('login.oauthLoading') : t('login.oauthSubmit')}
              {!oauth.isLoading && <ArrowRight size={16} aria-hidden />}
            </button>
          )}

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <label className="login-field">
              <span className="login-field__label">{t('login.email')}</span>
              <span className="login-field__control">
                <Mail size={16} aria-hidden className="login-field__icon" />
                <input
                  type="text"
                  name="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="demo o demo@pluarg.com.ar"
                  autoComplete="username"
                  autoFocus
                  required
                />
              </span>
            </label>

            <label className="login-field">
              <span className="login-field__row">
                <span className="login-field__label">{t('login.password')}</span>
                <button type="button" className="login-field__forgot">
                  {t('login.forgot')}
                </button>
              </span>
              <span className="login-field__control">
                <LockKeyhole size={16} aria-hidden className="login-field__icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="login-field__toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </label>

            <button type="submit" className="login-submit" disabled={isSubmitting}>
              {isSubmitting ? t('login.submitting') : t('login.submit')}
              {!isSubmitting && <ArrowRight size={16} aria-hidden />}
            </button>
            {submitError && (
              <p className="form-submit-error" role="alert">
                {submitError}
              </p>
            )}
          </form>

          <div className="login-separator" role="separator">
            <span>{t('login.separator')}</span>
          </div>

          <p className="login-join">
            {t('login.joinPrompt')}{' '}
            <button type="button" className="login-join__link" onClick={() => onNavigate('members')}>
              {t('login.joinLink')}
            </button>
          </p>
        </section>

        <aside className="login-brand">
          <div className="login-brand__logos">
            <BrandLogo variant="argentina" imgClassName="login-brand__emblem" height={44} />
            <BrandLogo variant="letterhead" imgClassName="login-brand__logo" height={34} />
          </div>
          <span className="login-brand__eyebrow">{t('login.eyebrow')}</span>
          <p className="login-brand__title">{t('login.title')}</p>
          <p className="login-brand__desc">{t('login.subtitle')}</p>
          <ul className="login-brand__features">
            {FEATURE_KEYS.map((key) => (
              <li key={key}>
                <Check size={14} strokeWidth={2.5} aria-hidden />
                {t(key)}
              </li>
            ))}
          </ul>
          <p className="login-brand__secure">
            <span className="login-secure-note__dot" aria-hidden />
            {t('login.secureNote')}
          </p>
        </aside>
      </div>

      <p className="login-page__footer">
        {t('login.footerNote')} ·{' '}
        <button type="button" onClick={() => onNavigate('home')}>
          {t('login.backToSite')}
        </button>
      </p>
    </main>
  )
}
