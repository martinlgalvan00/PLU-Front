import '../styles/pages/design-phase2.css'
import '../styles/pages/events.css'
import '../styles/layout/design-page-notebook.css'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, Ticket } from 'lucide-react'
import PluPageHero from '../components/layout/PluPageHero.jsx'
import FilterPills from '../components/ui/FilterPills.jsx'
import MotionContentSwap from '../motion/MotionContentSwap.tsx'
import Button from '../components/ui/Button.jsx'
import EventCalendar from '../components/ui/EventCalendar.jsx'
import EventCountdown from '../components/ui/EventCountdown.jsx'
import EventCard from '../components/ui/EventCard.jsx'
import EventLiveStream from '../components/ui/EventLiveStream.jsx'
import PitbullBrandMark from '../components/ui/PitbullBrandMark.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import StaggerReveal from '../components/ui/StaggerReveal.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { UPCOMING_EVENTS } from '../lib/events.js'
import { getStatusMeta } from '../lib/status.js'
import {
  getDaysUntilEvent,
  getFeaturedEvent,
  getFeaturedEventDestination,
  getNextUpcomingEvent,
  isPitbullClassicEvent,
} from '../lib/eventNavigation.js'
import EventCalendarActions from '../components/ui/EventCalendarActions.jsx'
import { ensureEventCalendarFields } from '../lib/calendar.js'
import { cheapestTicketTypePrice, ticketPricingFromEvent } from '../lib/eventPricing.js'
import { money } from '../lib/format.js'
import { fetchPublishedEvents } from '../services/eventAdminService.js'

function EventStatusBadge({ status, t }) {
  const { label, tone } = getStatusMeta(status, t)
  return <span className={`events-status-badge events-status-badge--${tone}`}>{label}</span>
}

function EventsCountdownChip({ event, days, t, minimal = false, onSelect }) {
  if (!event || days == null) return null

  if (minimal) {
    const content = (
      <>
        <span className="events-countdown-chip__value">{days}</span>
        <span className="events-countdown-chip__copy">
          <span className="events-countdown-chip__label">
            {days === 1 ? t('pages.events.countdownDay_one') : t('pages.events.countdownDay_other')}
          </span>
          <strong className="events-countdown-chip__title">{event.title}</strong>
        </span>
      </>
    )

    if (onSelect) {
      return (
        <button type="button" className="events-countdown-chip events-countdown-chip--minimal" onClick={onSelect}>
          {content}
        </button>
      )
    }

    return <p className="events-countdown-chip events-countdown-chip--minimal">{content}</p>
  }

  return (
    <div className="events-countdown-chip">
      <div className="events-countdown-chip__metric">
        <span className="events-countdown-chip__value">{days}</span>
      </div>
      <span className="events-countdown-chip__copy">
        <span className="events-countdown-chip__label">
          {days === 1 ? t('pages.events.countdownDay_one') : t('pages.events.countdownDay_other')}
        </span>
        <strong className="events-countdown-chip__title">{event.title}</strong>
      </span>
    </div>
  )
}

function EventsDetailPanel({
  event,
  isFeaturedSelected,
  onRegister,
  onViewPitbull,
  registerLabel,
  t,
  minimal = false,
}) {
  if (!event) {
    return (
      <div className={`events-detail events-detail--empty${minimal ? ' events-detail--minimal' : ''}`}>
        <p>{t('pages.events.emptyDetail')}</p>
      </div>
    )
  }

  if (isFeaturedSelected) {
    return (
      <div className={`events-detail events-detail--linked${minimal ? ' events-detail--minimal' : ''}`}>
        <p className="events-detail__linked-copy">{t('pages.events.selectedIsFeatured')}</p>
        {onViewPitbull ? (
          <button type="button" className="events-detail__text-link" onClick={onViewPitbull}>
            {t('pages.events.viewFull')}
            <ArrowRight size={14} aria-hidden />
          </button>
        ) : null}
      </div>
    )
  }

  const canRegister = event.status === 'inscripcion_abierta' || event.status === 'cupos_limitados'
  const statusCopy = t(`pages.events.statusCopy.${event.status}`)
  const hasStatusCopy = statusCopy && statusCopy !== `pages.events.statusCopy.${event.status}`

  if (minimal) {
    const [day, month] = String(event.displayDate || '').split(' ')
    const place = [event.venue, event.location].filter(Boolean).join(' · ')
    const { label: statusLabel, tone: statusTone } = getStatusMeta(event.status, t)

    return (
      <div className="events-detail events-detail--minimal">
        <div className="events-detail__spotlight">
          <div className="events-detail__date-hero" aria-hidden={day ? undefined : true}>
            <span className="events-detail__date-day">{day || '—'}</span>
            <span className="events-detail__date-month">{month || ''}</span>
          </div>
          <div className="events-detail__spotlight-copy">
            {isPitbullClassicEvent(event) ? (
              <>
                <div className="events-detail__brand">
                  <PitbullBrandMark size="sm" label={event.title} />
                </div>
                <h3 className="events-detail__title visually-hidden">{event.title}</h3>
              </>
            ) : (
              <h3 className="events-detail__title">{event.title}</h3>
            )}
            <p className="events-detail__meta-line">
              {statusLabel ? (
                <span className={`events-detail__status-inline events-detail__status-inline--${statusTone}`}>
                  {statusLabel}
                </span>
              ) : null}
              {statusLabel && place ? (
                <span className="events-detail__meta-sep" aria-hidden>
                  ·
                </span>
              ) : null}
              {place ? <span>{place}</span> : null}
            </p>
          </div>
        </div>

        <div className="events-detail__actions">
          {canRegister && onRegister ? (
            <Button className="events-detail__cta events-detail__cta--primary motion-icon-shift" onClick={onRegister}>
              {registerLabel}
              <ArrowRight size={15} aria-hidden className="motion-icon-shift__target" />
            </Button>
          ) : null}
          {onViewPitbull ? (
            <button type="button" className="events-detail__text-link" onClick={onViewPitbull}>
              {t('pages.events.viewFull')}
              <ArrowRight size={14} aria-hidden />
            </button>
          ) : null}
        </div>

        <EventLiveStream
          liveStatus={event.liveStatus}
          liveStreamUrl={event.liveStreamUrl}
          liveStreamProvider={event.liveStreamProvider}
        />

        <EventCalendarActions event={event} className="events-detail__calendar" variant="minimal" />
      </div>
    )
  }

  return (
    <div className="events-detail">
      <div className="events-detail__head">
        {isPitbullClassicEvent(event) ? (
          <>
            <div className="events-detail__brand">
              <PitbullBrandMark size="md" label={event.title} />
            </div>
            <h3 className="events-detail__title visually-hidden">{event.title}</h3>
          </>
        ) : (
          <h3 className="events-detail__title">{event.title}</h3>
        )}
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

      {hasStatusCopy ? <p className="events-detail__status-copy">{statusCopy}</p> : null}

      <div className="events-detail__actions">
        {canRegister && onRegister ? (
          <Button className="events-detail__cta events-detail__cta--primary motion-icon-shift" onClick={onRegister}>
            {registerLabel}
            <ArrowRight size={15} aria-hidden className="motion-icon-shift__target" />
          </Button>
        ) : null}
        {onViewPitbull ? (
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

function EventsAudienceTicketsPanel({ event, locale, onBuyTickets, t, minimal = false }) {
  const pricing = ticketPricingFromEvent(event)
  const ticketPrice = cheapestTicketTypePrice(pricing)
  const hasPublishedPrice = event?.pricing?.ticketsEnabled !== false && ticketPrice != null

  return (
    <section
      className={`events-public-tickets${minimal ? ' events-public-tickets--minimal' : ''}`}
      aria-labelledby="events-public-tickets-title"
    >
      <div className="events-public-tickets__copy">
        {!minimal ? <span className="events-public-tickets__eyebrow">{t('pages.events.publicTicketsEyebrow')}</span> : null}
        <h3 id="events-public-tickets-title">{t('pages.events.publicTicketsTitle')}</h3>
        {!minimal ? <p>{t('pages.events.publicTicketsLead')}</p> : null}
      </div>
      <div className="events-public-tickets__aside">
        <p className="events-public-tickets__price">
          {hasPublishedPrice
            ? t('pages.events.publicTicketsFrom', { price: money(ticketPrice, locale) })
            : t('pages.events.publicTicketsClosed')}
        </p>
        {minimal ? (
          <button
            type="button"
            className="events-public-tickets__text-link"
            onClick={onBuyTickets}
            disabled={!hasPublishedPrice}
          >
            {t('pages.events.publicTicketsCta')}
            <ArrowRight size={14} aria-hidden />
          </button>
        ) : (
          <Button
            variant="outline"
            className="events-public-tickets__cta motion-icon-shift"
            onClick={onBuyTickets}
            disabled={!hasPublishedPrice}
          >
            <Ticket size={14} aria-hidden />
            {t('pages.events.publicTicketsCta')}
            <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
          </Button>
        )}
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

  // El catálogo público llega de forma asíncrona. Si el deep-link apunta a
  // un evento que todavía no estaba en el seed inicial, no hay que perder ese
  // slug ni dejar seleccionado el fallback (antes /evento/test-2026 terminaba
  // mostrando Pitbull). Apenas aparece el evento real, lo enfocamos.
  useEffect(() => {
    if (!initialEventSlug) return
    const linkedEvent = events.find((event) => event.slug === initialEventSlug)
    if (!linkedEvent) return

    setSelectedSlug((current) => (current === linkedEvent.slug ? current : linkedEvent.slug))
    setCalendarFocus((current) =>
      current === linkedEvent.dateISO ? current : linkedEvent.dateISO,
    )
  }, [events, initialEventSlug])

  const filters = useMemo(
    () => [
      ['all', t('pages.events.filters.allShort')],
      ['open', t('pages.events.filters.openShort')],
      ['soon', t('pages.events.filters.soonShort')],
      ['done', t('pages.events.filters.doneShort')],
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

  const listEvents = filteredEvents

  useEffect(() => {
    if (listEvents.length === 0) {
      setSelectedSlug(null)
      return
    }

    const stillVisible = listEvents.some((event) => event.slug === selectedSlug)
    if (!stillVisible) {
      const next = listEvents[0]
      setSelectedSlug(next.slug)
      setCalendarFocus(next.dateISO)
    }
  }, [listEvents, selectedSlug])

  function focusEvent(event) {
    setSelectedSlug(event.slug)
    setCalendarFocus(event.dateISO)
  }

  /** Abre la ficha del evento: Pitbull a su página editorial; el resto a /evento/:slug. */
  function openEvent(event) {
    if (!event?.slug) return
    focusEvent(event)
    const destination = getFeaturedEventDestination(event)
    onNavigate?.(destination.view, destination.options)
  }

  const isAthleteLoggedIn = session?.role === 'athlete_plu'
  const registerLabel = isAthleteLoggedIn ? t('pages.events.register') : t('pages.events.registerAndCreateProfile')

  function handleRegister(event) {
    onSelectEvent?.(event)
  }

  function isRegistrationOpen(event) {
    return event.status === 'inscripcion_abierta' || event.status === 'cupos_limitados'
  }

  const visibleEventCount = listEvents.length

  const eventCountLabel =
    visibleEventCount === 1
      ? t('pages.events.eventCount_one', { count: visibleEventCount })
      : t('pages.events.eventCount_other', { count: visibleEventCount })

  const eventCountUnit = t(
    visibleEventCount === 1 ? 'pages.events.eventCount_one' : 'pages.events.eventCount_other',
    { count: '' },
  ).trim()

  const ticketsEvent = selected ?? nextEvent ?? pitbull

  return (
    <main className="page page--design page--plu-ref events-page--design events-page--plu-ref events-page--list-first">
      <PluPageHero
        className="events-page__hero"
        breadcrumbLabel={t('pages.events.heroBreadcrumb')}
        chapter={t('pages.events.heroChapter')}
        description={t('pages.events.heroDesc')}
        onHome={() => onNavigate('home')}
        title={t('pages.events.heroTitle')}
      />

      <div className="events-page__body">
        <div className="events-page__toolbar">
          <div className="events-page__filters-shell plu-tab-rail__shell">
            <FilterPills
              active={filter}
              ariaLabel={t('pages.events.filterAria')}
              className="events-page__filters filter-pills--refined plu-tab-rail"
              onChange={setFilter}
              options={filters}
            />
          </div>
          <span
            className="plu-meta-chip plu-meta-chip--divider events-page__count"
            aria-label={eventCountLabel}
            aria-live="polite"
          >
            <span className="plu-meta-chip__value" aria-hidden="true">
              {visibleEventCount}
            </span>
            <span className="plu-meta-chip__unit" aria-hidden="true">
              {eventCountUnit}
            </span>
          </span>
        </div>

        <EventsCountdownChip
          event={nextEvent}
          days={daysUntilNext}
          t={t}
          minimal
          onSelect={nextEvent ? () => openEvent(nextEvent) : undefined}
        />

        <MotionContentSwap swapKey={filter} className="events-main-column">
          {listEvents.length > 0 ? (
            <StaggerReveal className="events-list events-list--design events-list--minimal" stagger={48}>
              {listEvents.map((event) => (
                <EventCard
                  key={event.slug}
                  date={event.displayDate}
                  title={event.title}
                  venue={event.venue}
                  location={event.location}
                  status={event.status}
                  brand={isPitbullClassicEvent(event) ? 'pitbull' : null}
                  selected={selected?.slug === event.slug}
                  onSelect={() => openEvent(event)}
                  onAction={
                    isRegistrationOpen(event) ? () => handleRegister(event) : () => openEvent(event)
                  }
                  actionLabel={registerLabel}
                  variant="minimal"
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
        </MotionContentSwap>

        <Reveal
          variant="from-left"
          as="section"
          className="events-calendar-board events-calendar-board--secondary"
          aria-label={t('pages.events.calendarSectionTitle')}
        >
          {nextEvent ? (
            <EventCountdown
              event={nextEvent}
              className="events-calendar-board__countdown"
              compact
              onAction={
                nextEvent.status === 'inscripcion_abierta' || nextEvent.status === 'cupos_limitados'
                  ? () => handleRegister(nextEvent)
                  : undefined
              }
              onNavigate={
                pitbull?.slug && nextEvent.slug === pitbull.slug
                  ? () => openEvent(pitbull)
                  : nextEvent
                    ? () => openEvent(nextEvent)
                    : undefined
              }
              actionLabel={registerLabel}
            />
          ) : (
            <header className="events-calendar-board__head">
              <h2 className="events-calendar-board__title">{t('pages.events.calendarSectionTitle')}</h2>
            </header>
          )}
          <div className="events-calendar-board__grid">
            <div className="events-calendar-board__calendar">
              <EventCalendar
                events={filteredEvents}
                initialDate="2026-12-01"
                focusDateISO={calendarFocus}
                selectedEventSlug={selected?.slug}
                onEventSelect={focusEvent}
              />
            </div>
            <div className="events-calendar-board__panel">
              <MotionContentSwap swapKey={selected?.slug || 'none'}>
                <EventsDetailPanel
                  event={selected}
                  isFeaturedSelected={false}
                  minimal
                  onRegister={selected ? () => handleRegister(selected) : undefined}
                  onViewPitbull={
                    pitbull?.slug && selected?.slug === pitbull.slug
                      ? () => openEvent(pitbull)
                      : undefined
                  }
                  registerLabel={registerLabel}
                  t={t}
                />
              </MotionContentSwap>
              {ticketsEvent ? (
                <EventsAudienceTicketsPanel
                  event={ticketsEvent}
                  locale={locale}
                  minimal
                  onBuyTickets={() => onNavigate('tickets', { eventSlug: ticketsEvent.slug })}
                  t={t}
                />
              ) : null}
            </div>
          </div>
        </Reveal>
      </div>
    </main>
  )
}
