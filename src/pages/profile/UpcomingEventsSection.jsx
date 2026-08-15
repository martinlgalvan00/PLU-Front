import { useState } from 'react'
import { AlertTriangle, ArrowRight, Trophy } from 'lucide-react'
import PitbullBrandMark from '../../components/ui/PitbullBrandMark.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { EVENT_STATUS } from '../../lib/events.js'
import { isPitbullClassicEvent } from '../../lib/eventNavigation.js'
import { resolveComboDeal, resolveEventPricing } from '../../lib/eventPricing.js'
import { money } from '../../lib/format.js'
import { isMembershipCurrent } from '../../services/membershipService.js'
import { isProfileComplete } from '../../lib/athleteProfile.js'
import { getEventComboAvailability } from '../../services/comboOfferService.js'

function eventRequiresMembership(event) {
  return Boolean(event?.requiresMembership)
}

export default function UpcomingEventsSection({
  availableEvents,
  athleteRegistrations,
  membership,
  onNavigate,
  onSelectEvent,
  athlete,
  onNavigateSection,
  checkoutAvailability = {},
}) {
  const { locale, t } = useI18n()
  const hasActiveMembership = isMembershipCurrent(membership)
  const registrationCheckoutEnabled = checkoutAvailability.registrationEnabled !== false
  const [incompleteWarningEvent, setIncompleteWarningEvent] = useState(null)

  function goToRegistration(event) {
    // `onSelectEvent` fija el evento de la fila clickeada antes de navegar;
    // sin él, el wizard podía quedarse con el `selectedEvent` global viejo.
    if (onSelectEvent) {
      onSelectEvent(event)
      return
    }
    onNavigate('competition')
  }

  function handleRegisterClick(event) {
    if (!registrationCheckoutEnabled) return
    if (!athlete) {
      goToRegistration(event)
      return
    }
    const profileStatus = isProfileComplete(athlete)
    if (!profileStatus.complete) {
      setIncompleteWarningEvent(event.slug)
      return
    }
    setIncompleteWarningEvent(null)
    goToRegistration(event)
  }

  function handleGoToProfile() {
    setIncompleteWarningEvent(null)
    if (onNavigateSection) {
      onNavigateSection('account-personal-data')
    }
  }

  // Labels legibles de los campos requeridos faltantes
  const FIELD_LABELS = {
    phone: t('account.personalData.phone'),
    city: t('account.personalData.city'),
    province: t('account.personalData.province'),
    gym: t('account.personalData.gym'),
  }

  function getMissingFieldsLabel() {
    if (!athlete) return ''
    const { missing } = isProfileComplete(athlete)
    return missing.map((f) => FIELD_LABELS[f] ?? f).join(', ')
  }

  return (
    <section id="account-events" className="account-section account-section--events">
      <div className="account-section__heading">
        <div className="account-section__icon account-section__icon--gold" aria-hidden>
          <Trophy size={21} strokeWidth={1.75} />
        </div>
        <div>
          <span>{t('account.events.eyebrow')}</span>
          <h2>{t('account.events.title')}</h2>
        </div>
      </div>

      {/* Banner global de perfil incompleto (aparece cuando se toca inscribirse sin perfil completo) */}
      {incompleteWarningEvent && (
        <div className="account-incomplete-banner" role="alert">
          <div className="account-incomplete-banner__icon">
            <AlertTriangle size={18} aria-hidden />
          </div>
          <div className="account-incomplete-banner__body">
            <strong>{t('account.events.profileIncompleteTitle')}</strong>
            <p>{t('account.events.profileIncompleteBody', { fields: getMissingFieldsLabel() })}</p>
          </div>
          <button
            type="button"
            className="account-incomplete-banner__action"
            onClick={handleGoToProfile}
          >
            {t('account.events.profileIncompleteAction')}
            <ArrowRight size={14} aria-hidden />
          </button>
        </div>
      )}

      {availableEvents.length ? (
        <div className="account-events-list">
          {availableEvents.map((event) => {
            const registered = athleteRegistrations.some((item) => item.event === event.title)
            const needsMembership = eventRequiresMembership(event)
            const membershipPending = needsMembership && !hasActiveMembership
            const isPitbull = isPitbullClassicEvent(event)
            const profileStatus = athlete ? isProfileComplete(athlete) : { complete: true }
            const showingWarningForThis = incompleteWarningEvent === event.slug
            const comboAvailability = membershipPending
              ? getEventComboAvailability(event, { hasActiveMembership: false })
              : { offer: null, enabled: false }
            const comboDeal = comboAvailability.offer
              ? resolveComboDeal({
                  ...resolveEventPricing(event),
                  combo: comboAvailability.offer.price,
                })
              : null
            const showComboNote = comboAvailability.enabled && comboDeal?.live

            return (
              <article key={event.slug} className={`account-events-list__row${showingWarningForThis ? ' is-warning-active' : ''}`}>
                <time dateTime={event.dateISO}>{event.date}</time>
                <div className="account-events-list__body">
                  {isPitbull ? (
                    <>
                      <PitbullBrandMark size="sm" label={event.title} />
                      <h3 className="visually-hidden">{event.title}</h3>
                    </>
                  ) : (
                    <h3>{event.title}</h3>
                  )}
                  <p>
                    {event.venue} · {event.location}
                  </p>
                  {showComboNote ? (
                    <p className="account-event-membership-note account-event-membership-note--combo">
                      {t('account.events.comboAvailableText', {
                        amount: money(comboDeal.savings, locale),
                      })}
                    </p>
                  ) : membershipPending ? (
                    <p className="account-event-membership-note">
                      {t('account.events.membershipRequiredText')}
                    </p>
                  ) : null}
                </div>
                <span className="account-event-status">
                  {registered
                    ? membershipPending
                      ? t('account.qr.gateReserved')
                      : t('account.events.registered')
                    : EVENT_STATUS[event.status]?.label}
                </span>
                <button
                  type="button"
                  className={`account-events-list__cta${registered ? ' is-registered' : ''}${!profileStatus.complete && !registered ? ' is-profile-incomplete' : ''}`}
                  onClick={() => !registered && handleRegisterClick(event)}
                  disabled={registered || !registrationCheckoutEnabled}
                  aria-describedby={showingWarningForThis ? 'account-profile-incomplete-warning' : undefined}
                >
                  {registered
                    ? t('account.events.alreadyRegistered')
                    : registrationCheckoutEnabled
                      ? t('account.events.register')
                      : t('pages.members.ctaCheckoutSoon')}
                </button>
              </article>
            )
          })}
        </div>
      ) : (
        <p className="account-section__empty">{t('account.events.empty')}</p>
      )}
    </section>
  )
}
