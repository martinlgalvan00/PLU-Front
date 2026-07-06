import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, MapPin } from 'lucide-react'
import DesignPageHero from '../components/layout/DesignPageHero.jsx'
import FilterPills from '../components/ui/FilterPills.jsx'
import Button from '../components/ui/Button.jsx'
import EventCalendar from '../components/ui/EventCalendar.jsx'
import EventCard from '../components/ui/EventCard.jsx'
import PitbullSpotlight from '../components/ui/PitbullSpotlight.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import StaggerReveal from '../components/ui/StaggerReveal.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { UPCOMING_EVENTS } from '../lib/events.js'
import { getStatusMeta } from '../lib/status.js'

function EventStatusBadge({ status, t }) {
  const { label, tone } = getStatusMeta(status, t)
  return <span className={`events-status-badge events-status-badge--${tone}`}>{label}</span>
}

function EventsDetailPanel({ event, onRegister, onViewPitbull, t }) {
  if (!event) {
    return (
      <div className="events-detail events-detail--empty">
        <CalendarDays size={28} strokeWidth={1.5} aria-hidden />
        <p>{t('pages.events.emptyDetail')}</p>
      </div>
    )
  }

  const isPitbull = event.featured
  const canRegister = event.status === 'inscripcion_abierta' || event.status === 'cupos_limitados'
  const statusCopy = t(`pages.events.statusCopy.${event.status}`)

  return (
    <div className="events-detail">
      <div className="events-detail__head">
        <div className="events-detail__head-copy">
          <span className="events-detail__eyebrow">{t('pages.events.selectedEvent')}</span>
          <h3 className="events-detail__title">{event.title}</h3>
        </div>
        <EventStatusBadge status={event.status} t={t} />
      </div>

      <ul className="events-detail__meta">
        <li>
          <CalendarDays size={13} aria-hidden />
          {event.date}
        </li>
        <li>
          <MapPin size={13} aria-hidden />
          {event.venue}, {event.location}
        </li>
      </ul>

      {statusCopy && statusCopy !== `pages.events.statusCopy.${event.status}` && (
        <p className="events-detail__status-copy">{statusCopy}</p>
      )}

      <div className="events-detail__actions">
        {canRegister && onRegister && (
          <Button className="btn--small" onClick={onRegister}>
            {t('pages.events.register')}
            <ArrowRight size={14} aria-hidden />
          </Button>
        )}
        {isPitbull && onViewPitbull && (
          <Button variant="outline" className="btn--small" onClick={onViewPitbull}>
            {t('pages.events.viewFull')}
          </Button>
        )}
      </div>
    </div>
  )
}

export default function EventsPage({ onNavigate, onSelectEvent, events = UPCOMING_EVENTS }) {
  const { t } = useI18n()
  const pitbull = events.find((event) => event.featured) ?? events[0]
  const [selected, setSelected] = useState(pitbull)
  const [filter, setFilter] = useState('all')
  const [calendarFocus, setCalendarFocus] = useState(pitbull?.dateISO ?? '2026-12-01')

  const filters = useMemo(
    () => [
      ['all', t('pages.events.filters.all'), t('pages.events.filters.allShort')],
      ['open', t('pages.events.filters.open'), t('pages.events.filters.openShort')],
      ['soon', t('pages.events.filters.soon'), t('pages.events.filters.soonShort')],
      ['done', t('pages.events.filters.done')],
    ],
    [t],
  )

  const filterLabels = useMemo(
    () => ({
      all: t('pages.events.filterLabels.all'),
      open: t('pages.events.filterLabels.open'),
      soon: t('pages.events.filterLabels.soon'),
      done: t('pages.events.filterLabels.done'),
    }),
    [t],
  )

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (filter === 'open') {
        return event.status === 'inscripcion_abierta' || event.status === 'cupos_limitados'
      }
      if (filter === 'soon') return event.status === 'proximamente'
      if (filter === 'done') return event.status === 'finalizado'
      return event.status !== 'finalizado'
    })
  }, [events, filter])

  const showPitbull = (filter === 'all' || filter === 'soon') && pitbull?.status !== 'finalizado'

  const listEvents = useMemo(() => {
    if (filter === 'done') return filteredEvents
    return filteredEvents.filter((event) => !event.featured || !showPitbull)
  }, [filter, filteredEvents, showPitbull])

  useEffect(() => {
    if (listEvents.length === 0) {
      setSelected(null)
      return
    }

    const stillVisible = listEvents.some((event) => event.slug === selected?.slug)
    if (!stillVisible) {
      const next = listEvents[0]
      setSelected(next)
      setCalendarFocus(next.dateISO)
    }
  }, [listEvents, selected?.slug])

  function focusEvent(event) {
    setSelected(event)
    setCalendarFocus(event.dateISO)
  }

  function handleRegister(event) {
    onSelectEvent?.(event)
  }

  const filterIndex = filters.findIndex(([key]) => key === filter)
  const eventCountLabel =
    listEvents.length === 1
      ? t('pages.events.eventCount_one', { count: listEvents.length })
      : t('pages.events.eventCount_other', { count: listEvents.length })

  return (
    <main className="page page--design events-page--design events-page--premium">
      <DesignPageHero
        className="events-hero"
        compact
        breadcrumbLabel={t('pages.events.heroBreadcrumb')}
        onHome={() => onNavigate('home')}
        title={t('pages.events.heroTitle')}
        description={t('pages.events.heroDesc')}
      >
        <div className="events-hero__bar">
          <div className="events-hero__control-rail">
            <div className="events-hero__control-filters">
              <div
                className="events-hero__filters-shell events-toolbar__filters-shell--segmented"
                style={{
                  '--filter-active-index': Math.max(filterIndex, 0),
                  '--filter-count': filters.length,
                }}
              >
                <FilterPills
                  active={filter}
                  ariaLabel={t('pages.events.filterAria')}
                  className="filter-pills--refined events-hero__filters segmented-switch--luxury"
                  onChange={setFilter}
                  options={filters}
                  segmented
                />
              </div>
            </div>
            <span className="events-hero__count" aria-live="polite">
              {eventCountLabel}
            </span>
          </div>
        </div>
      </DesignPageHero>

      <div className="events-page__body">
        <div className="events-layout-v2">
          <div className="events-main-column">
            {showPitbull && pitbull && (
              <Reveal variant="from-left">
                <PitbullSpotlight
                  variant="events"
                  onDetail={() => onNavigate('pitbull')}
                  onRegister={
                    pitbull.status === 'inscripcion_abierta' || pitbull.status === 'cupos_limitados'
                      ? () => handleRegister(pitbull)
                      : undefined
                  }
                />
              </Reveal>
            )}

            {listEvents.length > 0 ? (
              <StaggerReveal className="events-list events-list--design" stagger={70}>
                {listEvents.map((event) => (
                  <EventCard
                    key={event.slug}
                    date={event.date}
                    title={event.title}
                    venue={event.venue}
                    location={event.location}
                    status={event.status}
                    selected={selected?.slug === event.slug}
                    onSelect={() => focusEvent(event)}
                    onAction={
                      event.status === 'inscripcion_abierta' || event.status === 'cupos_limitados'
                        ? () => handleRegister(event)
                        : () => focusEvent(event)
                    }
                    actionLabel={t('pages.events.register')}
                  />
                ))}
              </StaggerReveal>
            ) : (
              <div className="events-list__empty">
                <CalendarDays size={32} strokeWidth={1.5} aria-hidden />
                <p>{t('pages.events.emptyList', { filter: filterLabels[filter] })}</p>
                <Button variant="outline" className="btn--small" onClick={() => setFilter('all')}>
                  {t('nav.viewAllEvents')}
                </Button>
              </div>
            )}
          </div>

          <Reveal variant="from-right" as="aside" className="events-sidebar-card">
            <EventCalendar
              events={events}
              initialDate="2026-12-01"
              focusDateISO={calendarFocus}
              selectedEventSlug={selected?.slug}
              onEventSelect={focusEvent}
            />
            <EventsDetailPanel
              event={selected}
              onRegister={selected ? () => handleRegister(selected) : undefined}
              onViewPitbull={selected?.featured ? () => onNavigate('pitbull') : undefined}
              t={t}
            />
          </Reveal>
        </div>
      </div>
    </main>
  )
}
