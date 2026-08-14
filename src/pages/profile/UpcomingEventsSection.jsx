import { useState } from 'react'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import PitbullBrandMark from '../../components/ui/PitbullBrandMark.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { EVENT_STATUS } from '../../lib/events.js'
import { isPitbullClassicEvent } from '../../lib/eventNavigation.js'
import { isMembershipCurrent } from '../../services/membershipService.js'
import { isProfileComplete } from '../../lib/athleteProfile.js'

function eventRequiresMembership(event) {
  return Boolean(event?.requiresMembership)
}

export default function UpcomingEventsSection({
  availableEvents,
  athleteRegistrations,
  membership,
  onNavigate,
  athlete,
  onNavigateSection,
}) {
  const { t } = useI18n()
  const hasActiveMembership = isMembershipCurrent(membership)
  const [incompleteWarningEvent, setIncompleteWarningEvent] = useState(null)

  function handleRegisterClick(event) {
    if (!athlete) {
      onNavigate('competition')
      return
    }
    const profileStatus = isProfileComplete(athlete)
    if (!profileStatus.complete) {
      setIncompleteWarningEvent(event.slug)
      return
    }
    setIncompleteWarningEvent(null)
    onNavigate('competition')
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
          <span style={{ fontSize: 18 }}>🏆</span>
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
                  {membershipPending ? (
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
                  disabled={registered}
                  aria-describedby={showingWarningForThis ? 'account-profile-incomplete-warning' : undefined}
                >
                  {registered
                    ? t('account.events.alreadyRegistered')
                    : t('account.events.register')}
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
