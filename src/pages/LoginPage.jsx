import { useState } from 'react'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider.jsx'
import BrandLogo from '../components/ui/BrandLogo.jsx'
import { usePluOAuth } from '../providers/oauthContext.js'

const FEATURES = [
  { key: 'login.featureProfile', index: '01' },
  { key: 'login.featureMembership', index: '02' },
  { key: 'login.featureEvents', index: '03' },
]

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
    } catch (error) {
      setSubmitError(error?.status === 0 ? error.message : t('login.errorInvalid'))
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
        <aside className="login-brand" aria-label={t('login.brandAria')}>
          <div className="login-brand__logos">
            <BrandLogo variant="argentina" imgClassName="login-brand__emblem" height={64} />
            <span className="login-brand__logos-rule" aria-hidden />
            <div className="login-brand__wordmark">
              <BrandLogo variant="letterhead" imgClassName="login-brand__logo" height={42} />
              <span className="login-brand__lockup">{t('brand.federationLine')}</span>
            </div>
          </div>

          <div className="login-brand__intro">
            <span className="login-brand__eyebrow">{t('login.eyebrow')}</span>
            <h1 className="login-brand__title">{t('login.title')}</h1>
            <p className="login-brand__desc">{t('login.subtitle')}</p>
          </div>

          <ul className="login-brand__features" role="list">
            {FEATURES.map(({ key, index }) => (
              <li key={key} className="login-brand__feature">
                <span className="login-brand__feature-index" aria-hidden>
                  {index}
                </span>
                <span className="login-brand__feature-text">{t(key)}</span>
              </li>
            ))}
          </ul>

          <p className="login-brand__secure">{t('login.secureNote')}</p>
        </aside>

        <section className="login-card" aria-labelledby="login-heading">
          <header className="login-card__header">
            <div className="login-card__logos">
              <BrandLogo variant="argentina" imgClassName="login-card__emblem" height={40} />
              <BrandLogo variant="letterhead" imgClassName="login-card__logo" height={28} />
            </div>
            <span className="login-card__eyebrow">{t('login.eyebrow')}</span>
            <h1 id="login-heading">{t('login.title')}</h1>
            <p className="login-card__lead">{t('login.subtitle')}</p>
          </header>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <label className="login-field">
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
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
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

          {oauth.configured && (
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

          <p className="login-join">
            {t('login.joinPrompt')}{' '}
            <button type="button" className="login-join__link" onClick={() => onNavigate('members')}>
              {t('login.joinLink')}
            </button>
          </p>
        </section>
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
