import { useState } from 'react'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import BrandLogo from '../components/ui/BrandLogo.jsx'
import CheckInAppPage from './CheckInAppPage.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { canCheckIn, getRoleLabel } from '../lib/roles.js'

/**
 * SecurityGatePage — puerta de entrada dedicada por evento (/evento/:eventoSlug/seguridad).
 *
 * Login liviano scopeado a un evento puntual: una cuenta seguridad_plu_arg
 * solo entra si session.role + session.eventSlug matchean el slug de la URL
 * (el backend valida lo mismo en /api/auth/login, ver server/routes/auth.js).
 */
export default function SecurityGatePage({
  adminEvents,
  athletes,
  eventSlug,
  onCheckInRegistration,
  onCheckInTicket,
  onLogin,
  onLogout,
  onRedeemTicketAddon,
  onRefreshTickets,
  registrations,
  session,
  tickets,
}) {
  const { t } = useI18n()
  const event = adminEvents.find((item) => item.slug === eventSlug)
  const isAuthorized = session?.role === 'seguridad_plu_arg' && session?.eventSlug === eventSlug

  if (isAuthorized) {
    return (
      <CheckInAppPage
        athletes={athletes}
        canCheckIn={canCheckIn(session.role)}
        eventSlug={eventSlug}
        onCheckInRegistration={onCheckInRegistration}
        onCheckInTicket={onCheckInTicket}
        onExit={onLogout}
        onRedeemTicketAddon={onRedeemTicketAddon}
        onRefreshTickets={onRefreshTickets}
        registrations={registrations}
        roleLabel={getRoleLabel(session.role)}
        tickets={tickets}
      />
    )
  }

  return (
    <SecurityGateLogin
      event={event}
      eventSlug={eventSlug}
      hadSession={Boolean(session)}
      onLogin={onLogin}
      t={t}
    />
  )
}

function SecurityGateLogin({ event, eventSlug, hadSession, onLogin, t }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  async function handleSubmit(formEvent) {
    formEvent.preventDefault()
    setSubmitError('')
    setIsSubmitting(true)

    try {
      await onLogin({ email, password, eventSlug })
    } catch {
      setSubmitError(t('securityGate.errorInvalid'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="page login-page--design">
      <div className="login-shell">
        <section className="login-card" aria-labelledby="security-gate-heading">
          <header className="login-card__header">
            <div className="login-card__logos">
              <BrandLogo variant="argentina" imgClassName="login-card__emblem" height={40} />
              <BrandLogo variant="letterhead" imgClassName="login-card__logo" height={28} />
            </div>
            <span className="login-card__eyebrow">{t('securityGate.eyebrow')}</span>
            <h1 id="security-gate-heading">
              {event ? t('securityGate.titleWithEvent', { event: event.title }) : t('securityGate.title')}
            </h1>
            <p className="login-card__lead">{t('securityGate.subtitle')}</p>
          </header>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <label className="login-field">
              <span className="login-field__label">{t('login.email')}</span>
              <span className="login-field__control">
                <input
                  type="text"
                  name="email"
                  value={email}
                  onChange={(formEvent) => setEmail(formEvent.target.value)}
                  placeholder={t('login.emailPlaceholder')}
                  autoComplete="username"
                  autoFocus
                  required
                />
              </span>
            </label>

            <label className="login-field">
              <span className="login-field__label">{t('login.password')}</span>
              <span className="login-field__control">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={password}
                  onChange={(formEvent) => setPassword(formEvent.target.value)}
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
            {(submitError || hadSession) && (
              <p className="form-submit-error" role="alert">
                {submitError || t('securityGate.errorEventMismatch')}
              </p>
            )}
          </form>
        </section>
      </div>
    </main>
  )
}
