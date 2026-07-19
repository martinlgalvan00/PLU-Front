import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import BrandLogo from '../components/ui/BrandLogo.jsx'
import CheckInAppPage from './CheckInAppPage.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { UPCOMING_EVENTS } from '../lib/events.js'
import { canCheckIn, getRoleLabel } from '../lib/roles.js'

function resolveGateEvent(adminEvents, eventSlug) {
  const fromAdmin = adminEvents?.find((item) => item.slug === eventSlug)
  if (fromAdmin) return fromAdmin
  return UPCOMING_EVENTS.find((item) => item.slug === eventSlug) ?? null
}

/**
 * Lee el token de credencial de acceso del query param (?acceso=...) y lo
 * limpia de la URL, para que quede en el historial/barra de direcciones.
 */
function readAccessToken() {
  if (typeof window === 'undefined') return ''
  const token = new URLSearchParams(window.location.search).get('acceso')
  return token ?? ''
}

function stripAccessTokenFromUrl() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has('acceso')) return
  url.searchParams.delete('acceso')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

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
  onLoginWithToken,
  onLogout,
  onRedeemTicketAddon,
  onRefreshTickets,
  registrations,
  session,
  tickets,
}) {
  const { t } = useI18n()
  const event = resolveGateEvent(adminEvents, eventSlug)
  const isAuthorized = session?.role === 'seguridad_plu_arg' && session?.eventSlug === eventSlug

  // Credencial de acceso: si la URL trae ?acceso=<token>, intentamos entrar
  // sin contraseña. 'idle' | 'loading' | 'error'.
  const [tokenPhase, setTokenPhase] = useState(() => (readAccessToken() ? 'loading' : 'idle'))
  const attemptedRef = useRef(false)

  useEffect(() => {
    if (attemptedRef.current || isAuthorized) return
    const token = readAccessToken()
    if (!token || !onLoginWithToken) {
      setTokenPhase('idle')
      return
    }
    attemptedRef.current = true
    stripAccessTokenFromUrl()
    onLoginWithToken(token)
      .then(() => {
        // El éxito re-renderiza con session activa (isAuthorized) y monta el scanner.
      })
      .catch(() => setTokenPhase('error'))
  }, [isAuthorized, onLoginWithToken])

  if (isAuthorized) {
    return (
      <CheckInAppPage
        athletes={athletes}
        canCheckIn={canCheckIn(session.role)}
        eventSlug={eventSlug}
        eventTitle={event?.title}
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

  if (tokenPhase === 'loading') {
    return (
      <main className="page login-page--design login-page--gate">
        <div className="login-shell login-shell--gate">
          <section className="login-card security-gate-card security-gate-loading" aria-live="polite">
            <span className="security-gate-loading__icon" aria-hidden>
              <ShieldCheck size={26} />
            </span>
            <h1>{t('securityGate.tokenLoadingTitle')}</h1>
            <p className="login-card__lead">
              {event
                ? t('securityGate.tokenLoadingLeadWithEvent', { event: event.title })
                : t('securityGate.tokenLoadingLead')}
            </p>
            <span className="security-gate-loading__spinner" aria-hidden />
          </section>
        </div>
      </main>
    )
  }

  return (
    <SecurityGateLogin
      event={event}
      eventSlug={eventSlug}
      hadSession={Boolean(session)}
      onLogin={onLogin}
      tokenError={tokenPhase === 'error'}
      t={t}
    />
  )
}

function SecurityGateLogin({ event, eventSlug, hadSession, onLogin, tokenError = false, t }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const eventTitle = event?.title ?? null
  const eventMeta = [event?.venue, event?.location, event?.date].filter(Boolean).join(' · ')

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
    <main className="page login-page--design login-page--gate">
      <div className="login-shell login-shell--gate">
        <section className="login-card security-gate-card" aria-labelledby="security-gate-heading">
          <header className="login-card__header security-gate-card__header">
            <div className="login-card__logos">
              <BrandLogo variant="argentina" imgClassName="login-card__emblem" height={40} />
              <BrandLogo variant="letterhead" imgClassName="login-card__logo" height={28} />
            </div>

            <div className="security-gate-card__badge">
              <ShieldCheck size={15} aria-hidden />
              <span>{t('securityGate.eyebrow')}</span>
            </div>

            <p className="security-gate-card__kicker">{t('securityGate.areaLabel')}</p>
            <h1 id="security-gate-heading">
              {eventTitle ?? t('securityGate.title')}
            </h1>
            <p className="login-card__lead">
              {eventTitle
                ? t('securityGate.subtitleWithEvent', { event: eventTitle })
                : t('securityGate.subtitle')}
            </p>
            {eventMeta ? <p className="security-gate-card__meta">{eventMeta}</p> : null}
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
              {isSubmitting ? t('login.submitting') : t('securityGate.submit')}
              {!isSubmitting && <ArrowRight size={16} aria-hidden />}
            </button>
            {(submitError || tokenError || hadSession) && (
              <p className="form-submit-error" role="alert">
                {submitError ||
                  (tokenError ? t('securityGate.tokenError') : t('securityGate.errorEventMismatch'))}
              </p>
            )}
          </form>
        </section>
      </div>
    </main>
  )
}
