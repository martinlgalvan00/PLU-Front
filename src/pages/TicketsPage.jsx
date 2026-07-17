import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react'
import { m } from 'motion/react'
import heroPhoto from '../assets/DSC00392.jpg'
import TicketAvailabilityBadge from '../components/ui/TicketAvailabilityBadge.jsx'
import TicketPassPreview from '../components/ui/TicketPassPreview.jsx'
import TicketPurchaseSection from '../components/ui/TicketPurchaseSection.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { useTicketAvailability } from '../hooks/useTicketAvailability.js'
import { getUpcomingEventsByDate } from '../lib/eventNavigation.js'
import { ticketPricingFromEvent } from '../lib/eventPricing.js'
import { money } from '../lib/format.js'
import { useMotionConfig } from '../motion/MotionProvider.tsx'
import { heroSequenceItem, heroStaggerContainer } from '../motion/variants.ts'
import '../styles/pages/tickets.css'

function buildTicketDayLabels(event, t) {
  const label = event?.date || t('pages.ticketsPage.dateFallback')
  return {
    day1: label,
    day2: label,
  }
}

function resolveInitialEventId(initialEventSlug, ticketEvents, fallbackEvent) {
  if (initialEventSlug) {
    const match = ticketEvents.find((item) => (item.slug ?? item.id) === initialEventSlug)
    if (match) return match.id ?? match.slug ?? match.title
  }
  return fallbackEvent?.id ?? fallbackEvent?.slug ?? fallbackEvent?.title
}

export default function TicketsPage({
  event,
  events = [],
  initialEventSlug = null,
  tickets = [],
  createdOrder,
  onNavigate,
  onSubmitTicketPurchase,
  onUploadPaymentProof,
}) {
  const { locale, t } = useI18n()
  const { reducedMotion } = useMotionConfig()
  const ticketEvents = useMemo(() => {
    const keyed = new Map()
    for (const item of getUpcomingEventsByDate([event, ...events].filter(Boolean))) {
      keyed.set(item.id ?? item.slug ?? item.title, item)
    }
    return [...keyed.values()]
  }, [event, events])
  const [selectedEventId, setSelectedEventId] = useState(() =>
    resolveInitialEventId(initialEventSlug, ticketEvents, event),
  )
  const selectedEvent =
    ticketEvents.find((item) => (item.id ?? item.slug ?? item.title) === selectedEventId) ?? ticketEvents[0] ?? event
  const pricing = ticketPricingFromEvent(selectedEvent)
  const ticketSalesOpen = selectedEvent?.pricing?.ticketsEnabled !== false
  const availabilityRemaining = useTicketAvailability(ticketSalesOpen ? selectedEvent?.slug : null)
  const dayLabels = buildTicketDayLabels(selectedEvent, t)
  const visibleCreatedOrder =
    createdOrder?.type === 'tickets' && createdOrder.eventTitle === selectedEvent?.title ? createdOrder : null

  const saveDay = Math.max(0, (pricing.dayPresencial ?? 0) - (pricing.day ?? 0))
  const saveBoth = Math.max(0, (pricing.bothDaysPresencial ?? 0) - (pricing.bothDays ?? 0))
  const heroMark =
    String(selectedEvent?.title ?? '')
      .trim()
      .split(/\s+/)[0]
      ?.toUpperCase() || t('pages.ticketsPage.heroWatermark')

  useEffect(() => {
    setSelectedEventId(resolveInitialEventId(initialEventSlug, ticketEvents, event))
  }, [event, initialEventSlug])

  const Item = reducedMotion ? 'div' : m.div
  const itemProps = reducedMotion ? {} : { variants: heroSequenceItem }
  const HeroRoot = reducedMotion ? 'section' : m.section
  const heroRootProps = reducedMotion
    ? {}
    : { initial: 'hidden', animate: 'visible', variants: heroStaggerContainer }

  return (
    <main className="tickets-page">
      <HeroRoot
        className={`tickets-page__hero${reducedMotion ? '' : ' tickets-page__hero--motion'}`}
        aria-labelledby="tickets-page-title"
        {...heroRootProps}
      >
        <div className="tickets-page__hero-backdrop" aria-hidden>
          <img
            className="tickets-page__hero-backdrop-img"
            src={heroPhoto}
            alt=""
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
        </div>
        <div className="tickets-page__hero-atmosphere" aria-hidden />
        {reducedMotion ? (
          <p className="tickets-page__hero-watermark" aria-hidden>
            {heroMark}
          </p>
        ) : (
          <m.p
            className="tickets-page__hero-watermark"
            aria-hidden
            variants={{
              hidden: { y: 28, scale: 0.97 },
              visible: {
                y: 0,
                scale: 1,
                transition: { duration: 0.75, ease: [0.22, 1, 0.36, 1] },
              },
            }}
          >
            {heroMark}
          </m.p>
        )}

        <div className="tickets-page__shell tickets-page__hero-inner">
          <Item {...itemProps}>
            <button type="button" className="tickets-page__back" onClick={() => onNavigate('pitbull')}>
              <ArrowLeft size={15} aria-hidden />
              {t('pages.ticketsPage.backToEvent')}
            </button>
          </Item>

          <Item {...itemProps} className="tickets-page__hero-stripe" aria-hidden />

          <div className="tickets-page__hero-frame">
            <div className="tickets-page__hero-copy">
              <Item {...itemProps}>
                <p className="tickets-page__brand">{t('pages.ticketsPage.passBrand')}</p>
              </Item>
              <Item {...itemProps}>
                <p className="tickets-page__eyebrow">{t('pages.ticketsPage.eyebrow')}</p>
              </Item>
              <Item {...itemProps}>
                <h1 id="tickets-page-title">
                  {selectedEvent?.title ?? t('pages.ticketsPage.title')}
                </h1>
              </Item>
              <Item {...itemProps}>
                <div className="tickets-page__dateline" aria-label={t('pages.ticketsPage.eventMetaAria')}>
                  <p className="tickets-page__dateline-date">
                    {selectedEvent?.date ?? t('pages.ticketsPage.dateFallback')}
                  </p>
                  <p className="tickets-page__dateline-venue">
                    {selectedEvent?.venue ?? t('pages.ticketsPage.venueFallback')}
                  </p>
                </div>
              </Item>
              <Item {...itemProps}>
                <p className="tickets-page__lead">{t('pages.ticketsPage.lead')}</p>
              </Item>

              {ticketSalesOpen && availabilityRemaining != null ? (
                <Item {...itemProps}>
                  <TicketAvailabilityBadge remaining={availabilityRemaining} />
                </Item>
              ) : null}

              {ticketSalesOpen ? (
                <Item {...itemProps}>
                  <div className="tickets-page__hero-actions">
                    <a className="tickets-page__hero-cta motion-icon-shift" href="#checkout">
                      {t('pages.ticketsPage.heroCta')}
                      <ArrowRight size={15} aria-hidden className="tickets-page__hero-cta-icon motion-icon-shift__target" />
                    </a>
                    <a className="tickets-page__hero-link" href="#pass-preview">
                      {t('pages.ticketsPage.heroSeePass')}
                    </a>
                  </div>
                </Item>
              ) : null}
            </div>
          </div>
        </div>
      </HeroRoot>

      <section
        id="pass-preview"
        className="tickets-page__pass tickets-page__shell"
        aria-labelledby="tickets-pass-title"
      >
        <header className="tickets-page__pass-head">
          <span className="tickets-page__eyebrow">{t('pages.ticketsPage.passShowcaseEyebrow')}</span>
          <h2 id="tickets-pass-title">{t('pages.ticketsPage.passShowcaseTitle')}</h2>
          <p>{t('pages.ticketsPage.passShowcaseLead')}</p>
        </header>

        <div className="tickets-page__pass-stage" aria-label={t('pages.ticketsPage.quickCardAria')}>
          <TicketPassPreview
            eventTitle={selectedEvent?.title ?? t('pages.ticketsPage.eventFallback')}
            eventSlug={selectedEvent?.slug ?? selectedEvent?.id ?? ''}
            date={selectedEvent?.date ?? t('pages.ticketsPage.dateFallback')}
            venue={selectedEvent?.venue ?? t('pages.ticketsPage.venueFallback')}
          />
        </div>
      </section>

      {ticketEvents.length > 1 && (
        <section className="tickets-page__event-picker tickets-page__shell" aria-label={t('pages.ticketsPage.chooseEventAria')}>
          <div className="tickets-page__event-picker-head">
            <span>{t('pages.ticketsPage.chooseEventEyebrow')}</span>
            <h2>{t('pages.ticketsPage.chooseEventTitle')}</h2>
            <p>{t('pages.ticketsPage.chooseEventLead')}</p>
          </div>
          <div className="tickets-page__event-list" role="list">
            {ticketEvents.map((item) => {
              const itemId = item.id ?? item.slug ?? item.title
              const active = itemId === (selectedEvent?.id ?? selectedEvent?.slug ?? selectedEvent?.title)
              const itemPricing = ticketPricingFromEvent(item)
              return (
                <button
                  key={itemId}
                  type="button"
                  className={['tickets-page__event-option', active ? 'tickets-page__event-option--active' : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setSelectedEventId(itemId)}
                  role="listitem"
                >
                  <span>{active ? t('pages.ticketsPage.currentEvent') : t('pages.ticketsPage.availableEvent')}</span>
                  <strong>{item.title ?? t('pages.ticketsPage.eventFallback')}</strong>
                  <small>
                    {item.date ?? t('pages.ticketsPage.dateFallback')} · {item.venue ?? t('pages.ticketsPage.venueFallback')}
                  </small>
                  <em>
                    {money(itemPricing.day, locale)} {t('pages.ticketsPage.fromPerDay')}
                  </em>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <section className="tickets-page__offers tickets-page__shell" aria-labelledby="tickets-offers-title">
        <header className="tickets-page__offers-head">
          <span className="tickets-page__eyebrow">{t('pages.ticketsPage.offersEyebrow')}</span>
          <h2 id="tickets-offers-title">{t('pages.ticketsPage.offersTitle')}</h2>
          <p>{t('pages.ticketsPage.offersLead')}</p>
          {saveDay > 0 || saveBoth > 0 ? (
            <p className="tickets-page__offers-save">
              {saveDay > 0
                ? t('pages.ticketsPage.saveDay', { amount: money(saveDay, locale) })
                : null}
              {saveDay > 0 && saveBoth > 0 ? ' · ' : null}
              {saveBoth > 0
                ? t('pages.ticketsPage.saveBoth', { amount: money(saveBoth, locale) })
                : null}
            </p>
          ) : null}
        </header>

        <div className="tickets-page__offers-grid" aria-label={t('pages.ticketsPage.offersAria')}>
          <article className="tickets-page__offer tickets-page__offer--online">
            <span>{t('pages.ticketsPage.onlineBadge')}</span>
            <div className="tickets-page__offer-prices">
              <div>
                <small>{t('pages.ticketsPage.perDay')}</small>
                <strong>{money(pricing.day, locale)}</strong>
              </div>
              <div>
                <small>{t('pages.ticketsPage.bothDays')}</small>
                <strong>{money(pricing.bothDays, locale)}</strong>
              </div>
            </div>
            <p>{t('pages.ticketsPage.onlineHint')}</p>
          </article>

          <article className="tickets-page__offer tickets-page__offer--door">
            <span>{t('pages.ticketsPage.doorBadge')}</span>
            <div className="tickets-page__offer-prices">
              <div>
                <small>{t('pages.ticketsPage.perDay')}</small>
                <strong>{money(pricing.dayPresencial, locale)}</strong>
              </div>
              <div>
                <small>{t('pages.ticketsPage.bothDays')}</small>
                <strong>{money(pricing.bothDaysPresencial, locale)}</strong>
              </div>
            </div>
            <p>{t('pages.ticketsPage.doorHint')}</p>
          </article>
        </div>
      </section>

      <section
        id="checkout"
        className="tickets-page__checkout"
        aria-labelledby="tickets-checkout-title"
      >
        <div className="tickets-page__shell tickets-page__checkout-inner">
          <header className="tickets-page__checkout-head">
            <div className="tickets-page__checkout-copy">
              <span className="tickets-page__eyebrow">{t('pages.ticketsPage.checkoutEyebrow')}</span>
              <h2 id="tickets-checkout-title">{t('pages.ticketsPage.checkoutTitle')}</h2>
              <p>{t('pages.ticketsPage.checkoutLead')}</p>
            </div>
            <p className="tickets-page__trust">
              <ShieldCheck size={16} aria-hidden />
              {t('pages.ticketsPage.secureFlow')}
            </p>
          </header>

          <div className="tickets-page__checkout-panel">
            {ticketSalesOpen ? (
              <TicketPurchaseSection
                editorial
                showPassPreview={false}
                event={selectedEvent}
                dayLabels={dayLabels}
                pricing={pricing}
                tickets={tickets}
                createdOrder={visibleCreatedOrder}
                onSubmit={onSubmitTicketPurchase}
                onUploadPaymentProof={onUploadPaymentProof}
              />
            ) : (
              <p className="tickets-page__closed">{t('pages.ticketsPage.closed')}</p>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
