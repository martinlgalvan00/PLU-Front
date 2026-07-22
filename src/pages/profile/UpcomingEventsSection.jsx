import { Trophy } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { EVENT_STATUS } from '../../lib/events.js'

function eventRequiresMembership(event) {
  return Boolean(event?.requiresMembership)
}

export default function UpcomingEventsSection({ availableEvents, athleteRegistrations, membership, onNavigate }) {
  const { t } = useI18n()
  const hasActiveMembership = membership?.status === 'activa'

  return (
    <section id="account-events" className="account-section account-section--gold">
      <div className="account-section__heading">
        <div className="account-section__icon account-section__icon--gold"><Trophy size={21} /></div>
        <div><span>{t('account.events.eyebrow')}</span><h2>{t('account.events.title')}</h2></div>
      </div>
      {availableEvents.length ? (
        <div className="account-events-list">
          {availableEvents.map((event) => {
            const registered = athleteRegistrations.some((item) => item.event === event.title)
            const needsMembership = eventRequiresMembership(event)
            const membershipBlocks = needsMembership && !hasActiveMembership

            return (
              <article key={event.slug}>
                <time dateTime={event.dateISO}>{event.date}</time>
                <div>
                  <h3>{event.title}</h3>
                  <p>{event.venue} · {event.location}</p>
                  {membershipBlocks ? (
                    <p className="account-event-membership-note">{t('account.events.membershipRequiredText')}</p>
                  ) : null}
                </div>
                <span className="account-event-status">
                  {registered ? t('account.events.registered') : EVENT_STATUS[event.status]?.label}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate(membershipBlocks ? 'members' : 'competition')}
                  disabled={registered}
                >
                  {registered
                    ? t('account.events.alreadyRegistered')
                    : membershipBlocks
                      ? t('account.events.membershipRequiredButton')
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
