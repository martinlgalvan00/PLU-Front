import '../styles/pages/design-phase2.css'
import '../styles/pages/auth.css'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { env } from '../config/env.js'
import BrandLogo from '../components/ui/BrandLogo.jsx'
import CheckInAppPage from './CheckInAppPage.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { UPCOMING_EVENTS } from '../lib/events.js'
import { canCheckIn, getRoleLabel } from '../lib/roles.js'
import { canAccessSecurityEvent } from '../lib/permissions.js'
import { normalizeGateCode } from '../lib/ticketGateCode.js'

function resolveGateEvent(adminEvents, eventSlug) {
  const fromAdmin = adminEvents?.find((item) => item.slug === eventSlug)
  if (fromAdmin) return fromAdmin
  return UPCOMING_EVENTS.find((item) => item.slug === eventSlug) ?? null
}

/**
 * Lee la credencial de la URL (?c= código corto, o ?acceso= HMAC viejo) y la
 * limpia de la barra, para que no quede en el historial.
 */
function readGateCredential() {
  if (typeof window === 'undefined') return { token: '', code: '' }
  const params = new URLSearchParams(window.location.search)
  return {
    token: params.get('acceso') ?? '',
    code: params.get('c') ?? '',
  }
}

function stripGateCredentialFromUrl() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  let changed = false
  for (const key of ['acceso', 'c']) {
    if (!url.searchParams.has(key)) continue
    url.searchParams.delete(key)
    changed = true
  }
  if (!changed) return
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

/**
 * SecurityGatePage — puerta de entrada dedicada por evento (/evento/:eventoSlug/seguridad).
 *
 * Login liviano scopeado a un evento puntual. La autorización depende del
 * permiso de check-in y, cuando la cuenta tiene evento asignado, de su slug.
 */
export default function SecurityGatePage({
  adminEvents,
  athletes,
  eventSlug,
  onCheckInRegistration,
  onCheckInTicket,
  onExit,
  onLogin,
  onLoginWithToken,
  onReauthenticate,
  onRedeemTicketAddon,
  onRefreshTickets,
  registrations,
  session,
  tickets,
}) {
  const { t } = useI18n()
  const event = resolveGateEvent(adminEvents, eventSlug)
  const isAuthorized = canAccessSecurityEvent(session, eventSlug)

  // Credencial de acceso: si la URL trae ?acceso=<token>, intentamos entrar
  // sin contraseña. 'idle' | 'loading' | 'error'.
  const [tokenPhase, setTokenPhase] = useState(() => {
    const credential = readGateCredential()
    return credential.token || credential.code ? 'loading' : 'idle'
  })
  const attemptedRef = useRef(false)

  useEffect(() => {
    if (attemptedRef.current || isAuthorized) return
    const credential = readGateCredential()
    if ((!credential.token && !credential.code) || !onLoginWithToken) {
      setTokenPhase('idle')
      return
    }
    attemptedRef.current = true
    stripGateCredentialFromUrl()
    const login = credential.code
      ? onLoginWithToken({ code: credential.code, eventSlug })
      : onLoginWithToken(credential.token)
    login
      .then(() => {
        // El éxito re-renderiza con session activa (isAuthorized) y monta el scanner.
      })
      .catch(() => setTokenPhase('error'))
  }, [eventSlug, isAuthorized, onLoginWithToken])

  if (isAuthorized) {
    return (
      <CheckInAppPage
        athletes={athletes}
        canCheckIn={canCheckIn(session)}
        eventDays={event?.eventDays ?? []}
        eventSlug={eventSlug}
        eventTitle={event?.title}
        onCheckInRegistration={onCheckInRegistration}
        onCheckInTicket={onCheckInTicket}
        onExit={onExit}
        onReauthenticate={onReauthenticate}
        onRedeemTicketAddon={onRedeemTicketAddon}
        onRefreshTickets={onRefreshTickets}
        registrations={registrations}
        roleLabel={getRoleLabel(session)}
        securityZone={session?.securityZone ?? null}
        ticketTypes={event?.ticketTypes ?? []}
        tickets={tickets}
      />
    )
  }

  if (tokenPhase === 'loading') {
    return (
      <main className="page login-page--design login-page--gate">
        <div className="login-shell login-shell--gate">
          <section
            className="login-card security-gate-card security-gate-loading"
            aria-live="polite"
          >
            <span className="security-gate-loading__icon" aria-hidden>
              <ShieldCheck size={26} />
            </span>
            <h1>{t('securityGate.tokenLoadingTitle')}</h1>
            <p className="login-card__lead">
              {event
                ? t('securityGate.tokenLoadingLeadWithEvent', { event: event.title })
                : t('securityGate.tokenLoadingLead')}
            </p>
            <span
              className="plu-spinner plu-spinner--lg security-gate-loading__spinner"
              aria-hidden
            />
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
      onLoginWithToken={onLoginWithToken}
      tokenError={tokenPhase === 'error'}
      t={t}
    />
  )
}

function SecurityGateLogin({
  event,
  eventSlug,
  hadSession,
  onLogin,
  onLoginWithToken,
  tokenError = false,
  t,
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [doorCode, setDoorCode] = useState('')
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
      const normalized = normalizeGateCode(doorCode)
      if (doorCode.trim() && !normalized) {
        setSubmitError(t('securityGate.tokenError'))
        return
      }
      if (normalized && onLoginWithToken) {
        try {
          await onLoginWithToken({ code: normalized, eventSlug })
        } catch {
          setSubmitError(t('securityGate.tokenError'))
        }
        return
      }
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
            <h1 id="security-gate-heading">{eventTitle ?? t('securityGate.title')}</h1>
            <p className="login-card__lead">
              {eventTitle
                ? t('securityGate.subtitleWithEvent', { event: eventTitle })
                : t('securityGate.subtitle')}
            </p>
            {eventMeta ? <p className="security-gate-card__meta">{eventMeta}</p> : null}
          </header>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <label className="login-field">
              <span className="login-field__label">{t('securityGate.doorCodeLabel')}</span>
              <span className="login-field__control">
                <input
                  type="text"
                  name="doorCode"
                  value={doorCode}
                  onChange={(formEvent) => setDoorCode(formEvent.target.value.toUpperCase())}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  inputMode="text"
                />
              </span>
              <small className="security-gate-card__meta">{t('securityGate.doorCodeHint')}</small>
            </label>

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
            {env.demoMode && (
              <p className="security-gate-card__demo-hint">{t('securityGate.demoHint')}</p>
            )}
            {(submitError || tokenError || hadSession) && (
              <p className="form-submit-error" role="alert">
                {submitError ||
                  (tokenError
                    ? t('securityGate.tokenError')
                    : t('securityGate.errorEventMismatch'))}
              </p>
            )}
          </form>
        </section>
      </div>
    </main>
  )
}
