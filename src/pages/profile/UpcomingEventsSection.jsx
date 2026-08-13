import { Trophy } from 'lucide-react'
import PitbullBrandMark from '../../components/ui/PitbullBrandMark.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { EVENT_STATUS } from '../../lib/events.js'
import { isPitbullClassicEvent } from '../../lib/eventNavigation.js'
import { isMembershipCurrent } from '../../services/membershipService.js'

function eventRequiresMembership(event) {
  return Boolean(event?.requiresMembership)
}

export default function UpcomingEventsSection({ availableEvents, athleteRegistrations, membership, onNavigate }) {
  const { t } = useI18n()
  const hasActiveMembership = isMembershipCurrent(membership)

  return (
    <section id="account-events" className="account-section account-section--events">
      <div className="account-section__heading">
        <div className="account-section__icon account-section__icon--gold" aria-hidden>
          <Trophy size={18} strokeWidth={1.7} />
        </div>
        <div>
          <span>{t('account.events.eyebrow')}</span>
          <h2>{t('account.events.title')}</h2>
        </div>
      </div>
      {availableEvents.length ? (
        <div className="account-events-list">
          {availableEvents.map((event) => {
            const registered = athleteRegistrations.some((item) => item.event === event.title)
            const needsMembership = eventRequiresMembership(event)
            const membershipPending = needsMembership && !hasActiveMembership
            const isPitbull = isPitbullClassicEvent(event)

            return (
              <article key={event.slug} className="account-events-list__row">
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
                  className={`account-events-list__cta${registered ? ' is-registered' : ''}`}
                  onClick={() => onNavigate('competition')}
                  disabled={registered}
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
