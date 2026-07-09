import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, MapPin } from 'lucide-react'
import EventsPluHero from '../components/layout/EventsPluHero.jsx'
import FilterPills from '../components/ui/FilterPills.jsx'
import Button from '../components/ui/Button.jsx'
import EventCalendar from '../components/ui/EventCalendar.jsx'
import EventCard from '../components/ui/EventCard.jsx'
import EventLiveStream from '../components/ui/EventLiveStream.jsx'
import PitbullSpotlight from '../components/ui/PitbullSpotlight.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import StaggerReveal from '../components/ui/StaggerReveal.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { UPCOMING_EVENTS } from '../lib/events.js'
import { getStatusMeta } from '../lib/status.js'
import EventCalendarActions from '../components/ui/EventCalendarActions.jsx'
import { ensureEventCalendarFields } from '../lib/calendar.js'
import { fetchPublishedEvents } from '../services/eventAdminService.js'

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
          {event.displayDate}
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

      <EventLiveStream
        liveStatus={event.liveStatus}
        liveStreamUrl={event.liveStreamUrl}
        liveStreamProvider={event.liveStreamProvider}
      />

      <EventCalendarActions event={event} />
    </div>
  )
}

export default function EventsPage({ onNavigate, onSelectEvent, events: eventsProp = UPCOMING_EVENTS }) {
  const { locale, t } = useI18n()
  // El catálogo (título/venue/pricing) sigue viniendo del prop de arriba
  // (localStorage/mock); acá lo enriquecemos con lo que ya es real en
  // Supabase (calendario/directo) matcheando por slug — sin bloquear el
  // render si Supabase no responde (queda el evento tal cual vino).
  const [supabaseBySlug, setSupabaseBySlug] = useState({})

  useEffect(() => {
    let active = true
    fetchPublishedEvents()
      .then((rows) => {
        if (!active) return
        setSupabaseBySlug(Object.fromEntries(rows.map((row) => [row.slug, row])))
      })
      .catch((error) => {
        console.warn('No se pudieron cargar los eventos de Supabase.', error)
      })
    return () => {
      active = false
    }
  }, [])

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-AR', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      }),
    [locale],
  )

  const formatEventDate = useCallback(
    (dateISO) => {
      const parts = dateFormatter.formatToParts(new Date(dateISO))
      const day = parts.find((part) => part.type === 'day')?.value ?? ''
      const month = parts.find((part) => part.type === 'month')?.value ?? ''
      return `${day} ${month}`
    },
    [dateFormatter],
  )

  const events = useMemo(
    () =>
      eventsProp.map((event) => {
        const merged = ensureEventCalendarFields({ ...event, ...supabaseBySlug[event.slug] })
        return {
          ...merged,
          displayDate: merged.dateISO ? formatEventDate(merged.dateISO) : merged.date,
        }
      }),
    [eventsProp, supabaseBySlug, formatEventDate],
  )

  const pitbull = events.find((event) => event.featured) ?? events[0]
  // Se guarda el slug (no el objeto) para que `selected` siempre refleje la
  // versión más reciente del evento en `events` — incluidos los campos que
  // llegan async desde Supabase (calendario/directo) después del primer render.
  const [selectedSlug, setSelectedSlug] = useState(pitbull?.slug ?? null)
  const selected = events.find((event) => event.slug === selectedSlug) ?? null
  const [filter, setFilter] = useState('all')
  const [calendarFocus, setCalendarFocus] = useState(pitbull?.dateISO ?? '2026-12-01')

  const filters = useMemo(
    () => [
      ['all', t('pages.events.filters.all'), t('pages.events.filters.allShort')],
      ['open', t('pages.events.filters.open'), t('pages.events.filters.openShort')],
      ['soon', t('pages.events.filters.soon'), t('pages.events.filters.soonShort')],
      ['done', t('pages.events.filters.done'), t('pages.events.filters.doneShort')],
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
      if (showPitbull && pitbull?.slug) {
        setSelectedSlug(pitbull.slug)
        setCalendarFocus(pitbull.dateISO)
      } else {
        setSelectedSlug(null)
      }
      return
    }

    const stillVisible = listEvents.some((event) => event.slug === selectedSlug)
    if (!stillVisible) {
      const next = listEvents[0]
      setSelectedSlug(next.slug)
      setCalendarFocus(next.dateISO)
    }
  }, [listEvents, selectedSlug, showPitbull, pitbull])

  function focusEvent(event) {
    setSelectedSlug(event.slug)
    setCalendarFocus(event.dateISO)
  }

  function handleRegister(event) {
    onSelectEvent?.(event)
  }

  const visibleEventCount = listEvents.length + (showPitbull && pitbull ? 1 : 0)

  const eventCountLabel =
    visibleEventCount === 1
      ? t('pages.events.eventCount_one', { count: visibleEventCount })
      : t('pages.events.eventCount_other', { count: visibleEventCount })

  return (
    <main className="page page--design events-page--design events-page--plu-ref">
      <EventsPluHero onHome={() => onNavigate('home')} />

      <div className="events-page__body">
        <div className="events-page__toolbar">
          <FilterPills
            active={filter}
            ariaLabel={t('pages.events.filterAria')}
            className="events-page__filters filter-pills--refined"
            onChange={setFilter}
            options={filters}
          />
          <span className="events-page__count" aria-live="polite">
            {eventCountLabel}
          </span>
        </div>
        <div className="events-layout-v2">
          <div className="events-main-column">
            {showPitbull && pitbull && (
              <Reveal variant="from-left">
                <PitbullSpotlight
                  variant="events"
                  event={pitbull}
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
                    date={event.displayDate}
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
            ) : showPitbull ? (
              <div className="events-list__note">
                <p>{t('pages.events.moreEventsSoon')}</p>
              </div>
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
