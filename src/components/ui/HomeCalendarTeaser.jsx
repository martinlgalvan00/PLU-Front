import { useMemo } from 'react'
import { ArrowRight, Calendar } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getStatusMeta } from '../../lib/status.js'
import { getNextUpcomingEvent, getTimeUntilEvent, getUpcomingEventsByDate } from '../../lib/eventNavigation.js'
import EventCountdown from './EventCountdown.jsx'
import Reveal from './Reveal.jsx'

/**
 * Teaser del calendario para la Home.
 * Countdown editorial + mini-lista de próximos eventos + CTA al calendario.
 */
export default function HomeCalendarTeaser({
  events = [],
  onNavigate,
  onSelectEvent,
  session,
}) {
  const { t } = useI18n()

  const nextEvent = useMemo(() => getNextUpcomingEvent(events), [events])
  const upcomingEvents = useMemo(
    () => getUpcomingEventsByDate(events).slice(0, 3),
    [events],
  )

  const isAthleteLoggedIn = session?.role === 'athlete_plu'
  const registerLabel = isAthleteLoggedIn
    ? t('pages.events.register')
    : t('pages.events.registerAndCreateProfile')

  if (!nextEvent && upcomingEvents.length === 0) return null

  return (
    <Reveal className="home-calendar-teaser" variant="fade">
      <header className="home-calendar-teaser__head">
        <div className="home-calendar-teaser__head-copy">
          <span className="home-calendar-teaser__eyebrow">
            <Calendar size={13} strokeWidth={1.8} aria-hidden />
            {t('pages.events.heroChapter')}
          </span>
          <h2 className="home-calendar-teaser__title">
            {t('pages.events.calendarSectionTitle')}
          </h2>
        </div>
      </header>

      <div className="home-calendar-teaser__body">
        {nextEvent ? (
          <EventCountdown
            event={nextEvent}
            className="home-calendar-teaser__countdown"
            onAction={
              (nextEvent.status === 'inscripcion_abierta' || nextEvent.status === 'cupos_limitados')
                ? () => onSelectEvent?.(nextEvent)
                : undefined
            }
            onNavigate={() => onNavigate?.('events', { eventSlug: nextEvent.slug })}
            actionLabel={registerLabel}
          />
        ) : null}

        {upcomingEvents.length > 0 ? (
          <div className="home-calendar-teaser__timeline">
            <div className="home-calendar-teaser__timeline-rail" aria-hidden />
            {upcomingEvents.map((event) => (
              <MiniEventItem
                key={event.slug}
                event={event}
                isNext={event.slug === nextEvent?.slug}
                onSelect={() => onNavigate?.('events', { eventSlug: event.slug })}
                t={t}
              />
            ))}
          </div>
        ) : null}
      </div>

      <footer className="home-calendar-teaser__foot">
        <button
          type="button"
          className="home-calendar-teaser__cta motion-icon-shift"
          onClick={() => onNavigate?.('events')}
        >
          {t('nav.viewAllEvents')}
          <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
        </button>
      </footer>
    </Reveal>
  )
}

function MiniEventItem({ event, isNext, onSelect, t }) {
  const [day, monthRaw] = (event.date || event.displayDate || '').split(' ')
  const month = monthRaw?.replace('.', '') || ''
  const { label: statusLabel, tone } = getStatusMeta(event.status, t)
  const timeInfo = getTimeUntilEvent(event)
  const daysLabel = timeInfo && !timeInfo.isPast && timeInfo.days > 0
    ? `${timeInfo.days}d`
    : null

  return (
    <button
      type="button"
      className={[
        'home-calendar-teaser__item',
        isNext ? 'home-calendar-teaser__item--next' : '',
      ].filter(Boolean).join(' ')}
      onClick={onSelect}
    >
      <span className="home-calendar-teaser__item-date">
        <span className="home-calendar-teaser__item-day">{day || '—'}</span>
        <span className="home-calendar-teaser__item-month">{month}</span>
      </span>
      <span className="home-calendar-teaser__item-body">
        <span className="home-calendar-teaser__item-title">{event.title}</span>
        <span className="home-calendar-teaser__item-meta">
          <span className={`home-calendar-teaser__item-status home-calendar-teaser__item-status--${tone}`}>
            {statusLabel}
          </span>
          {event.venue ? (
            <>
              <span className="home-calendar-teaser__item-sep" aria-hidden>·</span>
              <span>{event.venue}</span>
            </>
          ) : null}
        </span>
      </span>
      {daysLabel ? (
        <span className="home-calendar-teaser__item-countdown">{daysLabel}</span>
      ) : null}
    </button>
  )
}
