import { AlertTriangle, Trophy } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { EVENT_STATUS } from '../../lib/events.js'

export default function UpcomingEventsSection({ availableEvents, athleteRegistrations, membership, onNavigate }) {
  const { t } = useI18n()
  const hasActiveMembership = membership?.status === 'activa'

  return (
    <section id="account-events" className="account-section account-section--gold">
      <div className="account-section__heading">
        <div className="account-section__icon account-section__icon--gold"><Trophy size={21} /></div>
        <div><span>{t('account.events.eyebrow')}</span><h2>{t('account.events.title')}</h2></div>
      </div>
      {!hasActiveMembership && (
        <div className="account-membership-required" role="alert">
          <AlertTriangle size={18} aria-hidden />
          <div>
            <strong>{t('account.events.membershipRequiredTitle')}</strong>
            <p>{t('account.events.membershipRequiredText')}</p>
          </div>
        </div>
      )}
      {availableEvents.length ? (
        <div className="account-events-list">
          {availableEvents.map((event) => {
            const registered = athleteRegistrations.some((item) => item.event === event.title)
            return (
              <article key={event.slug}>
                <time dateTime={event.dateISO}>{event.date}</time>
                <div><h3>{event.title}</h3><p>{event.venue} · {event.location}</p></div>
                <span className="account-event-status">
                  {registered ? t('account.events.registered') : EVENT_STATUS[event.status]?.label}
                </span>
                <button type="button" onClick={() => onNavigate('competition')} disabled={registered || !hasActiveMembership}>
                  {registered
                    ? t('account.events.alreadyRegistered')
                    : hasActiveMembership
                      ? t('account.events.register')
                      : t('account.events.membershipRequiredButton')}
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
