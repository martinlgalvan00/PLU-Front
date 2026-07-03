import { useState } from 'react'
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider.jsx'
import BrandLogo from '../components/ui/BrandLogo.jsx'

const FEATURE_KEYS = ['login.featureProfile', 'login.featureMembership', 'login.featureEvents']

export default function LoginPage({ onLogin, onNavigate }) {
  const { t } = useI18n()
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function enter(type) {
    const session = onLogin(type)
    onNavigate(session.role === 'athlete_plu' ? 'profile' : 'admin')
  }

  function handleSubmit(event) {
    event.preventDefault()
    setIsSubmitting(true)
    window.setTimeout(() => {
      enter('athlete')
      setIsSubmitting(false)
    }, 280)
  }

  return (
    <main className="page login-page--design">
      <div className="login-shell">
        <aside className="login-brand" aria-labelledby="login-heading">
          <div className="login-brand__logos">
            <BrandLogo variant="argentina" imgClassName="login-brand__emblem" height={44} />
            <BrandLogo variant="letterhead" imgClassName="login-brand__logo" height={34} />
          </div>
          <span className="login-brand__eyebrow">{t('login.eyebrow')}</span>
          <h1 id="login-heading">{t('login.title')}</h1>
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

        <section className="login-card" aria-label={t('login.title')}>
          <div className="login-card__tricolor" aria-hidden />

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <label className="login-field">
              <span className="login-field__label">{t('login.email')}</span>
              <span className="login-field__control">
                <Mail size={16} aria-hidden className="login-field__icon" />
                <input
                  type="email"
                  name="email"
                  placeholder="nombre@pluarg.com.ar"
                  autoComplete="email"
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
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  minLength={6}
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
          </form>

          <div className="login-separator" role="separator">
            <span>{t('login.separator')}</span>
          </div>

          <button type="button" className="login-join-btn" onClick={() => onNavigate('members')}>
            {t('login.joinPrompt')}{' '}
            <span>{t('login.joinLink')}</span>
          </button>

          <details className="login-demo">
            <summary>{t('login.demoTitle')}</summary>
            <div className="login-demo__actions">
              <button type="button" onClick={() => enter('admin')}>
                {t('login.demoAdmin')}
              </button>
              <button type="button" onClick={() => enter('athlete')}>
                {t('login.demoAthlete')}
              </button>
            </div>
          </details>
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
