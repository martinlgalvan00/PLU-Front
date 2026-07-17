import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, Ticket } from 'lucide-react'
import PluPageHero from '../components/layout/PluPageHero.jsx'
import FilterPills from '../components/ui/FilterPills.jsx'
import MotionContentSwap from '../motion/MotionContentSwap.tsx'
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
import { getDaysUntilEvent, getFeaturedEvent, getNextUpcomingEvent } from '../lib/eventNavigation.js'
import EventCalendarActions from '../components/ui/EventCalendarActions.jsx'
import { ensureEventCalendarFields } from '../lib/calendar.js'
import { resolveEventPricing } from '../lib/eventPricing.js'
import { money } from '../lib/format.js'
import { fetchPublishedEvents } from '../services/eventAdminService.js'

function EventStatusBadge({ status, t }) {
  const { label, tone } = getStatusMeta(status, t)
  return <span className={`events-status-badge events-status-badge--${tone}`}>{label}</span>
}

function EventsCountdownChip({ event, days, t }) {
  if (!event || days == null) return null

  return (
    <div className="events-countdown-chip">
      <span className="events-countdown-chip__value">{days}</span>
      <span className="events-countdown-chip__copy">
        <span className="events-countdown-chip__label">
          {days === 1 ? t('pages.events.countdownDay_one') : t('pages.events.countdownDay_other')}
        </span>
        <strong className="events-countdown-chip__title">{event.title}</strong>
      </span>
    </div>
  )
}

function EventsDetailPanel({ event, onRegister, onViewPitbull, registerLabel, t }) {
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
        <h3 className="events-detail__title">{event.title}</h3>
        <EventStatusBadge status={event.status} t={t} />
      </div>

      <p className="events-detail__meta-line">
        <span>{event.displayDate}</span>
        <span className="events-detail__meta-sep" aria-hidden>
          ·
        </span>
        <span>
          {event.venue}, {event.location}
        </span>
      </p>

      {statusCopy && statusCopy !== `pages.events.statusCopy.${event.status}` ? (
        <p className="events-detail__status-copy">{statusCopy}</p>
      ) : null}

      <div className="events-detail__actions">
        {canRegister && onRegister ? (
          <Button className="events-detail__cta events-detail__cta--primary motion-icon-shift" onClick={onRegister}>
            {registerLabel}
            <ArrowRight size={15} aria-hidden className="motion-icon-shift__target" />
          </Button>
        ) : null}
        {isPitbull && onViewPitbull ? (
          <Button
            variant="outline"
            className="events-detail__cta events-detail__cta--secondary motion-icon-shift"
            onClick={onViewPitbull}
          >
            {t('pages.events.viewFull')}
            <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
          </Button>
        ) : null}
      </div>

      <EventLiveStream
        liveStatus={event.liveStatus}
        liveStreamUrl={event.liveStreamUrl}
        liveStreamProvider={event.liveStreamProvider}
      />

      <EventCalendarActions event={event} className="events-detail__calendar" compact />
    </div>
  )
}

function EventsAudienceTicketsPanel({ event, locale, onBuyTickets, t }) {
  const pricing = resolveEventPricing(event)
  const ticketPrice = pricing.ticketBothDays || pricing.ticketDay
  const ticketsEnabled = pricing.ticketsEnabled !== false

  return (
    <section className="events-public-tickets" aria-labelledby="events-public-tickets-title">
      <div className="events-public-tickets__copy">
        <span className="events-public-tickets__eyebrow">{t('pages.events.publicTicketsEyebrow')}</span>
        <h3 id="events-public-tickets-title">{t('pages.events.publicTicketsTitle')}</h3>
        <p>{t('pages.events.publicTicketsLead')}</p>
      </div>
      <div className="events-public-tickets__aside">
        <p className="events-public-tickets__price">
          {ticketsEnabled
            ? t('pages.events.publicTicketsFrom', { price: money(ticketPrice, locale) })
            : t('pages.events.publicTicketsClosed')}
        </p>
        <Button
          variant="outline"
          className="events-public-tickets__cta motion-icon-shift"
          onClick={onBuyTickets}
          disabled={!ticketsEnabled}
        >
          <Ticket size={14} aria-hidden />
          {t('pages.events.publicTicketsCta')}
          <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
        </Button>
      </div>
    </section>
  )
}

export default function EventsPage({
  initialEventSlug,
  onNavigate,
  onSelectEvent,
  events: eventsProp = UPCOMING_EVENTS,
  session,
}) {
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

  const pitbull = getFeaturedEvent(events)
  const nextEvent = useMemo(() => getNextUpcomingEvent(events), [events])
  const daysUntilNext = useMemo(() => getDaysUntilEvent(nextEvent), [nextEvent])
  // Se guarda el slug (no el objeto) para que `selected` siempre refleje la
  // versión más reciente del evento en `events` — incluidos los campos que
  // llegan async desde Supabase (calendario/directo) después del primer render.
  // Si llega un slug por deep-link (/evento/:slug), arranca con ese preseleccionado.
  const [selectedSlug, setSelectedSlug] = useState(() => {
    if (initialEventSlug && eventsProp.some((event) => event.slug === initialEventSlug)) {
      return initialEventSlug
    }
    return pitbull?.slug ?? null
  })
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
    // El evento destacado se excluye de `listEvents` porque ya se muestra en
    // el spotlight principal — pero sigue "visible" en el sidebar (calendario +
    // detalle), así que no hay que sacarlo de la selección solo por no estar
    // en esa lista.
    const pitbullSelected = showPitbull && pitbull?.slug && selectedSlug === pitbull.slug
    if (pitbullSelected) return

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

  const isAthleteLoggedIn = session?.role === 'athlete_plu'
  const registerLabel = isAthleteLoggedIn ? t('pages.events.register') : t('pages.events.registerAndCreateProfile')

  function handleRegister(event) {
    if (!isAthleteLoggedIn) {
      onNavigate('register')
      return
    }
    onSelectEvent?.(event)
  }

  const visibleEventCount = listEvents.length + (showPitbull && pitbull ? 1 : 0)

  const eventCountLabel =
    visibleEventCount === 1
      ? t('pages.events.eventCount_one', { count: visibleEventCount })
      : t('pages.events.eventCount_other', { count: visibleEventCount })

  return (
    <main className="page page--design page--plu-ref events-page--design events-page--plu-ref">
      <PluPageHero
        breadcrumbLabel={t('pages.events.heroBreadcrumb')}
        chapter={t('pages.events.heroChapter')}
        description={t('pages.events.heroDesc')}
        onHome={() => onNavigate('home')}
        title={t('pages.events.heroTitle')}
      />

      <div className="events-page__body">
        <div className="events-page__toolbar">
          <div className="events-page__filters-shell">
            <span className="events-page__filters-label">{t('pages.events.filterLabel')}</span>
            <FilterPills
              active={filter}
              ariaLabel={t('pages.events.filterAria')}
              className="events-page__filters filter-pills--editorial"
              onChange={setFilter}
              options={filters}
            />
          </div>
          <span className="events-page__count" aria-live="polite">
            {eventCountLabel}
          </span>
        </div>
        <div className="events-layout-v2">
          <MotionContentSwap swapKey={filter} className="events-main-column">
            {showPitbull && pitbull && (
              <Reveal variant="from-left">
                <div className="events-featured-stack">
                  <PitbullSpotlight
                    variant="events"
                    event={pitbull}
                    onDetail={() => onNavigate('pitbull')}
                    onRegister={() => handleRegister(pitbull)}
                    registerLabel={registerLabel}
                  />
                  <EventsAudienceTicketsPanel
                    event={pitbull}
                    locale={locale}
                    onBuyTickets={() => onNavigate('tickets', { eventSlug: pitbull?.slug })}
                    t={t}
                  />
                </div>
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
                    actionLabel={registerLabel}
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
          </MotionContentSwap>

          <Reveal variant="from-right" as="aside" className="events-sidebar-card">
            <EventsCountdownChip event={nextEvent} days={daysUntilNext} t={t} />
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
              registerLabel={registerLabel}
              t={t}
            />
          </Reveal>
        </div>
      </div>
    </main>
  )
}
