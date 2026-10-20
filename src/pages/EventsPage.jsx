import '../styles/pages/design-phase2.css'
import '../styles/pages/event-landing-themes.css'
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
import EventsTeaser from '../components/ui/EventsTeaser.jsx'
import PitbullBrandMark from '../components/ui/PitbullBrandMark.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import StaggerReveal from '../components/ui/StaggerReveal.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { UPCOMING_EVENTS } from '../lib/events.js'
import { withPublicEventStatus } from '../lib/publicRegistrationPhase.js'
import { getStatusMeta } from '../lib/status.js'
import {
  getFeaturedEvent,
  getFeaturedEventDestination,
  getNextUpcomingEvent,
  getPublicCatalogEvents,
  isPitbullClassicEvent,
} from '../lib/eventNavigation.js'
import {
  eventHasEditorialLanding,
  eventLandingFaqItems,
  eventLandingFromEvent,
  eventLandingThemeId,
} from '../lib/eventLanding.js'
import EventCalendarActions from '../components/ui/EventCalendarActions.jsx'
import EventWeighInSchedule, {
  eventHasWeighInWindows,
} from '../components/ui/EventWeighInSchedule.jsx'
import {
  eventShowsPublicFaq,
  eventShowsPublicLivestream,
  eventShowsPublicWeighIns,
} from '../lib/eventPublicSurface.js'
import { ensureEventCalendarFields } from '../lib/calendar.js'
import { resolveEventLogo } from '../lib/eventMark.js'
import { resolveAthleteEventStatus } from '../lib/athleteEventStatus.js'
import { isStaffSession } from '../lib/roles.js'
import {
  cheapestTicketTypePrice,
  eventStatusClosesTicketSales,
  resolveEventPricing,
  ticketPricingFromEvent,
} from '../lib/eventPricing.js'
import { money } from '../lib/format.js'
import { fetchPublishedEvents } from '../services/eventAdminService.js'
import { fetchSiteTeaser } from '../services/siteTeaserService.js'
import { env } from '../config/env.js'
import { isPaidCheckoutOpen } from '../lib/registrationSchedule.js'
import { getEventComboAvailability } from '../services/comboOfferService.js'
import { hasCurrentMembership } from '../services/membershipService.js'
import SeasonComboOffer from '../components/ui/SeasonComboOffer.jsx'

function EventStatusBadge({ status, t }) {
  const { label, tone } = getStatusMeta(status, t)
  return <span className={`events-status-badge events-status-badge--${tone}`}>{label}</span>
}

function EventsDetailPanel({
  event,
  onRegister,
  onViewEvent,
  registerLabel,
  athleteStatus = null,
  comboOffer = null,
  comboPricing = null,
  t,
  minimal = false,
  registrationCheckoutEnabled = true,
}) {
  if (!event) {
    return (
      <div
        className={`events-detail events-detail--empty${minimal ? ' events-detail--minimal' : ''}`}
      >
        <p>{t('pages.events.emptyDetail')}</p>
      </div>
    )
  }

  const checkoutOpen =
    registrationCheckoutEnabled &&
    isPaidCheckoutOpen(event, env, new Date(), { checkoutKind: 'registration' })
  const statusAllowsRegister =
    event.status === 'inscripcion_abierta' || event.status === 'cupos_limitados'
  const canRegister = checkoutOpen && statusAllowsRegister && athleteStatus !== 'registered'
  const showComingSoonCta = !checkoutOpen && statusAllowsRegister && athleteStatus !== 'registered'
  const statusCopy = t(`pages.events.statusCopy.${event.status}`)
  const hasStatusCopy = statusCopy && statusCopy !== `pages.events.statusCopy.${event.status}`
  const athleteStatusLabel = athleteStatus ? t(`pages.events.athleteStatus.${athleteStatus}`) : null
  const athleteStatusHint = athleteStatus
    ? t(`pages.events.athleteStatusHint.${athleteStatus}`)
    : null
  const resolvedRegisterLabel = !checkoutOpen
    ? t('pages.members.ctaCheckoutSoon')
    : athleteStatus === 'needs_membership'
      ? t('pages.events.athleteStatusAction.needs_membership')
      : athleteStatus === 'pending_payment'
        ? t('pages.events.athleteStatusAction.pending_payment')
        : registerLabel
  // El combo se muestra solo junto al CTA de inscripción real: si el registro
  // está cerrado o ya se completó, la promo tampoco tiene sentido.
  const showCombo = Boolean(comboOffer) && canRegister
  const eventLogo = resolveEventLogo(event)
  const landing = eventLandingFromEvent(event)
  const faqItems = eventShowsPublicFaq(event) ? eventLandingFaqItems(landing.slots) : []
  const themeId = eventLandingThemeId(event)

  if (minimal) {
    const hintReady =
      Boolean(athleteStatusHint) &&
      athleteStatusHint !== `pages.events.athleteStatusHint.${athleteStatus}`
    // Visitante: el tip de cuenta solo tiene sentido si ya puede inscribirse.
    // En "próximamente" / cerrado mostramos el estado del meet, no marketing.
    const showGuestHint = athleteStatus === 'guest' && canRegister && hintReady
    const showPersonalHint =
      athleteStatus &&
      athleteStatus !== 'guest' &&
      athleteStatus !== 'closed' &&
      hintReady
    const showHint = showGuestHint || showPersonalHint
    const showStatusLine = hasStatusCopy && !showGuestHint
    const pitbull = eventHasEditorialLanding(event) || isPitbullClassicEvent(event)
    const [dateDay, dateMonth] = String(event.displayDate ?? '').split(/\s+/, 2)

    return (
      <div
        className="events-detail events-detail--minimal event-landing-theme"
        data-event-theme={themeId}
      >
        <p className="events-detail__panel-eyebrow">{t('pages.events.detailPanelEyebrow')}</p>

        <div className="events-detail__brief">
          {dateDay ? (
            <div className="events-detail__date-hero" aria-hidden>
              <span className="events-detail__date-day">{dateDay}</span>
              {dateMonth ? <span className="events-detail__date-month">{dateMonth}</span> : null}
            </div>
          ) : null}

          <div className="events-detail__brief-body">
            <div className="events-detail__head">
              {pitbull ? (
                <>
                  <div className="events-detail__brand">
                    <PitbullBrandMark size="sm" label={event.title} />
                  </div>
                  <h3 className="events-detail__title visually-hidden">{event.title}</h3>
                </>
              ) : (
                <div className="events-detail__identity">
                  {eventLogo ? (
                    <span className="events-detail__mark" aria-hidden="true">
                      <img
                        src={eventLogo}
                        alt=""
                        width={96}
                        height={96}
                        loading="lazy"
                        decoding="async"
                      />
                    </span>
                  ) : null}
                  <h3 className="events-detail__title">{event.title}</h3>
                </div>
              )}
              <EventStatusBadge status={event.status} t={t} />
            </div>

            <p className="events-detail__meta-line">
              <span className="visually-hidden">{event.displayDate}</span>
              <span>
                {event.venue}
                {event.location ? `, ${event.location}` : ''}
              </span>
            </p>
          </div>
        </div>

        {showStatusLine ? <p className="events-detail__status-copy">{statusCopy}</p> : null}
        {showHint ? <p className="events-detail__athlete-hint">{athleteStatusHint}</p> : null}

        {eventHasWeighInWindows(event) && eventShowsPublicWeighIns(event) ? (
          <section className="events-detail__weighins" aria-label={t('pages.events.weighInsTitle')}>
            <h4 className="events-detail__weighins-title">{t('pages.events.weighInsTitle')}</h4>
            <EventWeighInSchedule windows={event.weighInWindows} />
          </section>
        ) : null}

        {faqItems.length > 0 ? (
          <section
            className="events-detail__faq"
            aria-labelledby="events-detail-faq-title"
          >
            <h4 id="events-detail-faq-title" className="events-detail__faq-title">
              {t('pages.events.landingFaqTitle')}
            </h4>
            <dl className="events-detail__faq-list">
              {faqItems.map((item) => (
                <div key={item.question} className="events-detail__faq-item">
                  <dt>{item.question}</dt>
                  <dd>{item.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {showCombo ? (
          <SeasonComboOffer
            variant="compact"
            className="events-detail__combo-offer"
            membershipPrice={comboPricing?.membership}
            registrationPrice={comboPricing?.registration}
            comboPrice={comboOffer.price}
            endsAt={comboOffer.endsAt}
          />
        ) : null}

        <div className="events-detail__actions">
          {showComingSoonCta ? (
            <p className="events-detail__coming-soon" role="status">
              {t('pages.members.ctaCheckoutSoon')}
            </p>
          ) : null}
          {canRegister && onRegister ? (
            <button
              type="button"
              className="events-detail__text-link events-detail__text-link--primary motion-icon-shift"
              onClick={onRegister}
            >
              {resolvedRegisterLabel}
              <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
            </button>
          ) : null}
          {onViewEvent ? (
            <button
              type="button"
              className={`events-detail__text-link motion-icon-shift${canRegister ? '' : ' events-detail__text-link--primary'}`}
              onClick={onViewEvent}
            >
              {t('pages.events.viewFull')}
              <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
            </button>
          ) : null}
        </div>

        {eventShowsPublicLivestream(event) ? (
          <EventLiveStream
            liveStatus={event.liveStatus}
            liveStreamUrl={event.liveStreamUrl}
            liveStreamProvider={event.liveStreamProvider}
          />
        ) : null}

        <EventCalendarActions event={event} className="events-detail__calendar" variant="minimal" />
      </div>
    )
  }

  return (
    <div className="events-detail event-landing-theme" data-event-theme={themeId}>
      <div className="events-detail__head">
        {isPitbullClassicEvent(event) ? (
          <>
            <div className="events-detail__brand">
              <PitbullBrandMark size="md" label={event.title} />
            </div>
            <h3 className="events-detail__title visually-hidden">{event.title}</h3>
          </>
        ) : (
          <div className="events-detail__identity">
            {eventLogo ? (
              <span className="events-detail__mark" aria-hidden="true">
                <img
                  src={eventLogo}
                  alt=""
                  width={96}
                  height={96}
                  loading="lazy"
                  decoding="async"
                />
              </span>
            ) : null}
            <h3 className="events-detail__title">{event.title}</h3>
          </div>
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
      {athleteStatusLabel && athleteStatus !== 'guest' ? (
        <p className="events-detail__athlete-status">{athleteStatusLabel}</p>
      ) : null}
      {athleteStatusHint &&
      athleteStatusHint !== `pages.events.athleteStatusHint.${athleteStatus}` &&
      (athleteStatus !== 'guest' || canRegister) ? (
        <p className="events-detail__athlete-hint">{athleteStatusHint}</p>
      ) : null}

      {eventHasWeighInWindows(event) && eventShowsPublicWeighIns(event) ? (
        <section className="events-detail__weighins" aria-label={t('pages.events.weighInsTitle')}>
          <h4 className="events-detail__weighins-title">{t('pages.events.weighInsTitle')}</h4>
          <EventWeighInSchedule windows={event.weighInWindows} />
        </section>
      ) : null}

      {faqItems.length > 0 ? (
        <section className="events-detail__faq" aria-labelledby="events-detail-faq-title">
          <h4 id="events-detail-faq-title" className="events-detail__faq-title">
            {t('pages.events.landingFaqTitle')}
          </h4>
          <dl className="events-detail__faq-list">
            {faqItems.map((item) => (
              <div key={item.question} className="events-detail__faq-item">
                <dt>{item.question}</dt>
                <dd>{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {showCombo ? (
        <SeasonComboOffer
          variant="compact"
          className="events-detail__combo-offer"
          membershipPrice={comboPricing?.membership}
          registrationPrice={comboPricing?.registration}
          comboPrice={comboOffer.price}
          endsAt={comboOffer.endsAt}
        />
      ) : null}

      <div className="events-detail__actions">
        {canRegister && onRegister ? (
          <Button
            className="events-detail__cta events-detail__cta--primary motion-icon-shift"
            onClick={onRegister}
          >
            {resolvedRegisterLabel}
            <ArrowRight size={15} aria-hidden className="motion-icon-shift__target" />
          </Button>
        ) : null}
        {showComingSoonCta ? (
          <p className="events-detail__coming-soon" role="status">
            {t('pages.members.ctaCheckoutSoon')}
          </p>
        ) : null}
        {onViewEvent ? (
          <Button
            variant="outline"
            className="events-detail__cta events-detail__cta--secondary motion-icon-shift"
            onClick={onViewEvent}
          >
            {t('pages.events.viewFull')}
            <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
          </Button>
        ) : null}
      </div>

      {eventShowsPublicLivestream(event) ? (
        <EventLiveStream
          liveStatus={event.liveStatus}
          liveStreamUrl={event.liveStreamUrl}
          liveStreamProvider={event.liveStreamProvider}
        />
      ) : null}

      <EventCalendarActions event={event} className="events-detail__calendar" compact />
    </div>
  )
}

function EventsAudienceTicketsPanel({ event, locale, onBuyTickets, t, minimal = false }) {
  const pricing = ticketPricingFromEvent(event)
  const ticketPrice = cheapestTicketTypePrice(pricing)
  // Solo `finalizado` corta la venta: `cerrado` es de inscripción de atletas.
  // Si aplica, se dice "Venta cerrada" en vez de ofrecer una compra que rebota.
  const salesClosed = eventStatusClosesTicketSales(event)
  const hasPublishedPrice =
    event?.pricing?.ticketsEnabled === true && ticketPrice != null && !salesClosed
  const closedLabel = t(
    salesClosed ? 'pages.events.publicTicketsSalesClosed' : 'pages.events.publicTicketsClosed',
  )

  if (minimal) {
    return (
      <section
        className="events-public-tickets events-public-tickets--minimal"
        aria-labelledby="events-public-tickets-title"
      >
        <div className="events-public-tickets__band">
          <h3 id="events-public-tickets-title" className="events-public-tickets__title">
            {t('pages.events.publicTicketsTitleShort')}
          </h3>
          <p className="events-public-tickets__price">
            {hasPublishedPrice ? (
              <>
                <span className="events-public-tickets__price-caption">
                  {t('pages.events.publicTicketsFromCaption')}
                </span>
                <span className="events-public-tickets__price-value">
                  {money(ticketPrice, locale)}
                </span>
              </>
            ) : (
              <span className="events-public-tickets__price-closed">{closedLabel}</span>
            )}
          </p>
          <button
            type="button"
            className="events-public-tickets__text-link motion-icon-shift"
            onClick={onBuyTickets}
            disabled={!hasPublishedPrice}
          >
            {t('pages.events.publicTicketsCta')}
            <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="events-public-tickets" aria-labelledby="events-public-tickets-title">
      <div className="events-public-tickets__copy">
        <span className="events-public-tickets__eyebrow">
          {t('pages.events.publicTicketsEyebrow')}
        </span>
        <h3 id="events-public-tickets-title">{t('pages.events.publicTicketsTitle')}</h3>
        <p>{t('pages.events.publicTicketsLead')}</p>
      </div>
      <div className="events-public-tickets__aside">
        <p className="events-public-tickets__price">
          {hasPublishedPrice
            ? t('pages.events.publicTicketsFrom', { price: money(ticketPrice, locale) })
            : closedLabel}
        </p>
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
  memberships = [],
  registrations = [],
  checkoutAvailability = {},
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

  // Anuncio "Pronto habrá novedades". Arranca apagado y así se queda si la
  // lectura falla: un anuncio de hype no puede aparecer por un error de red.
  const [teaserEnabled, setTeaserEnabled] = useState(false)

  useEffect(() => {
    let active = true
    fetchSiteTeaser()
      .then((teaser) => {
        if (active) setTeaserEnabled(teaser.eventsEnabled)
      })
      .catch(() => {})
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

  /** "11–13 dic" para un meet de varias jornadas del mismo mes; si no, la fecha de inicio. */
  const formatEventDisplayDate = useCallback(
    (event) => {
      if (!event.dateISO) return event.date
      const start = formatEventDate(event.dateISO)
      const endKey = /^(\d{4}-\d{2}-\d{2})/.exec(String(event.endsAt ?? ''))?.[1]
      if (!endKey || endKey <= event.dateISO.slice(0, 10)) return start
      const [startDay, month] = start.split(' ')
      const [endDay, endMonth] = formatEventDate(endKey).split(' ')
      return month === endMonth ? `${startDay}–${endDay} ${month}` : start
    },
    [formatEventDate],
  )

  const events = useMemo(() => {
    const eventsBySlug = new Map()
    for (const event of eventsProp) {
      if (event?.slug) eventsBySlug.set(event.slug, event)
    }
    for (const event of Object.values(supabaseBySlug)) {
      if (event?.slug) eventsBySlug.set(event.slug, { ...eventsBySlug.get(event.slug), ...event })
    }

    return getPublicCatalogEvents([...eventsBySlug.values()], {
      includeDevelopmentStubs: false,
    }).map((event) => {
      const merged = withPublicEventStatus(
        ensureEventCalendarFields({ ...event, ...supabaseBySlug[event.slug] }),
        new Date(),
        { registrationEnabled: checkoutAvailability.registrationEnabled !== false },
      )
      return {
        ...merged,
        displayDate: formatEventDisplayDate(merged),
      }
    })
  }, [eventsProp, supabaseBySlug, formatEventDisplayDate, checkoutAvailability.registrationEnabled])

  const spotlightEvent = getFeaturedEvent(events)
  const nextEvent = useMemo(() => getNextUpcomingEvent(events), [events])
  // Se guarda el slug (no el objeto) para que `selected` siempre refleje la
  // versión más reciente del evento en `events` — incluidos los campos que
  // llegan async desde Supabase (calendario/directo) después del primer render.
  // Si llega un slug por deep-link (/evento/:slug), arranca con ese preseleccionado.
  const [selectedSlug, setSelectedSlug] = useState(() => {
    if (initialEventSlug && eventsProp.some((event) => event.slug === initialEventSlug)) {
      return initialEventSlug
    }
    return spotlightEvent?.slug ?? null
  })
  const selected = events.find((event) => event.slug === selectedSlug) ?? null
  const [filter, setFilter] = useState('all')
  const [calendarFocus, setCalendarFocus] = useState(spotlightEvent?.dateISO ?? '2026-12-01')

  // El catálogo público llega de forma asíncrona. Si el deep-link apunta a
  // un evento que todavía no estaba en el seed inicial, no hay que perder ese
  // slug ni dejar seleccionado el fallback. Apenas aparece el evento real, lo enfocamos.
  useEffect(() => {
    if (!initialEventSlug) return
    const linkedEvent = events.find((event) => event.slug === initialEventSlug)
    if (!linkedEvent) return

    setSelectedSlug((current) => (current === linkedEvent.slug ? current : linkedEvent.slug))
    setCalendarFocus((current) => (current === linkedEvent.dateISO ? current : linkedEvent.dateISO))
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
  const canRegisterAsAthlete = isAthleteLoggedIn || isStaffSession(session)
  const registerLabel = canRegisterAsAthlete
    ? t('pages.events.register')
    : t('pages.events.registerAndCreateProfile')
  const hasActiveMembership = hasCurrentMembership(memberships, session?.athleteId)
  const selectedComboAvailability = selected
    ? getEventComboAvailability(selected, { hasActiveMembership })
    : { offer: null, enabled: false }
  const selectedComboOffer = selectedComboAvailability.enabled
    ? selectedComboAvailability.offer
    : null
  const selectedComboPricing = selectedComboOffer ? resolveEventPricing(selected) : null
  const registrationCheckoutEnabled = checkoutAvailability.registrationEnabled !== false

  function handleRegister(event) {
    onSelectEvent?.(event)
  }

  function isRegistrationOpen(event) {
    return (
      registrationCheckoutEnabled &&
      isPaidCheckoutOpen(event, env, new Date(), { checkoutKind: 'registration' }) &&
      (event.status === 'inscripcion_abierta' || event.status === 'cupos_limitados')
    )
  }

  function eventTicketsAvailable(event) {
    return (
      env.ticketSalesEnabled &&
      Boolean(event) &&
      !eventStatusClosesTicketSales(event) &&
      resolveEventPricing(event).ticketsEnabled === true
    )
  }

  function handleEventCardAction(event) {
    if (isRegistrationOpen(event)) {
      handleRegister(event)
      return
    }
    if (eventTicketsAvailable(event)) {
      onNavigate?.('tickets', { eventSlug: event.slug })
      return
    }
    openEvent(event)
  }

  function eventCardActionLabel(event) {
    if (isRegistrationOpen(event)) return registerLabel
    if (eventTicketsAvailable(event)) return t('pages.events.publicTicketsCta')
    return t('pages.events.viewFull')
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

  const ticketsEvent = selected ?? nextEvent ?? spotlightEvent

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

        <MotionContentSwap swapKey={filter} className="events-main-column">
          {listEvents.length > 0 ? (
            <StaggerReveal
              className="events-list events-list--design events-list--minimal"
              stagger={48}
            >
              {listEvents.map((event) => (
                <EventCard
                  key={event.slug}
                  date={event.displayDate}
                  title={event.title}
                  slug={event.slug}
                  logoUrl={event.logoUrl}
                  venue={event.venue}
                  location={event.location}
                  status={event.status}
                  brand={isPitbullClassicEvent(event) ? 'pitbull' : null}
                  selected={selected?.slug === event.slug}
                  athleteStatus={resolveAthleteEventStatus({
                    event,
                    session,
                    registrations,
                    memberships,
                  })}
                  ticketsAvailable={eventTicketsAvailable(event)}
                  onSelect={() => openEvent(event)}
                  onAction={() => handleEventCardAction(event)}
                  actionLabel={eventCardActionLabel(event)}
                  actionLive={isRegistrationOpen(event) || eventTicketsAvailable(event)}
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

        {/* El archivo no es lugar para un "se viene": en Finalizados no se muestra. */}
        {teaserEnabled && filter !== 'done' ? (
          <EventsTeaser className="events-page__teaser" />
        ) : null}

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
              onNavigate={() => openEvent(nextEvent)}
            />
          ) : (
            <header className="events-calendar-board__head">
              <h2 className="events-calendar-board__title">
                {t('pages.events.calendarSectionTitle')}
              </h2>
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
                  minimal
                  athleteStatus={
                    selected
                      ? resolveAthleteEventStatus({
                          event: selected,
                          session,
                          registrations,
                          memberships,
                        })
                      : null
                  }
                  onRegister={selected ? () => handleRegister(selected) : undefined}
                  onViewEvent={selected ? () => openEvent(selected) : undefined}
                  registerLabel={registerLabel}
                  comboOffer={selectedComboOffer}
                  comboPricing={selectedComboPricing}
                  registrationCheckoutEnabled={registrationCheckoutEnabled}
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
