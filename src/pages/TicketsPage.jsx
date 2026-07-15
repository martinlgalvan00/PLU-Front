import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, MapPin, ShieldCheck, Ticket } from 'lucide-react'
import TicketPurchaseSection from '../components/ui/TicketPurchaseSection.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { getUpcomingEventsByDate } from '../lib/eventNavigation.js'
import { ticketPricingFromEvent } from '../lib/eventPricing.js'
import { money } from '../lib/format.js'
import '../styles/pages/tickets.css'

function buildTicketDayLabels(event, t) {
  const label = event?.date || t('pages.ticketsPage.dateFallback')
  return {
    day1: label,
    day2: label,
  }
}

export default function TicketsPage({
  event,
  events = [],
  tickets = [],
  createdOrder,
  onNavigate,
  onSubmitTicketPurchase,
  onUploadPaymentProof,
}) {
  const { locale, t } = useI18n()
  const ticketEvents = useMemo(() => {
    const keyed = new Map()
    for (const item of getUpcomingEventsByDate([event, ...events].filter(Boolean))) {
      keyed.set(item.id ?? item.slug ?? item.title, item)
    }
    return [...keyed.values()]
  }, [event, events])
  const [selectedEventId, setSelectedEventId] = useState(event?.id ?? event?.slug ?? event?.title)
  const selectedEvent =
    ticketEvents.find((item) => (item.id ?? item.slug ?? item.title) === selectedEventId) ?? ticketEvents[0] ?? event
  const pricing = ticketPricingFromEvent(selectedEvent)
  const ticketSalesOpen = selectedEvent?.pricing?.ticketsEnabled !== false
  const dayLabels = buildTicketDayLabels(selectedEvent, t)
  const visibleCreatedOrder =
    createdOrder?.type === 'tickets' && createdOrder.eventTitle === selectedEvent?.title ? createdOrder : null

  useEffect(() => {
    setSelectedEventId(event?.id ?? event?.slug ?? event?.title)
  }, [event])

  return (
    <main className="tickets-page">
      <section className="tickets-page__hero" aria-labelledby="tickets-page-title">
        <div className="tickets-page__shell">
          <button type="button" className="tickets-page__back" onClick={() => onNavigate('events')}>
            <ArrowLeft size={15} aria-hidden />
            {t('pages.ticketsPage.backToEvents')}
          </button>

          <div className="tickets-page__hero-grid">
            <div className="tickets-page__hero-copy">
              <span className="tickets-page__eyebrow">{t('pages.ticketsPage.eyebrow')}</span>
              <h1 id="tickets-page-title">{t('pages.ticketsPage.title')}</h1>
              <p>{t('pages.ticketsPage.lead', { event: selectedEvent?.title ?? t('pages.ticketsPage.eventFallback') })}</p>

              <dl className="tickets-page__event-meta" aria-label={t('pages.ticketsPage.eventMetaAria')}>
                <div>
                  <CalendarDays size={16} aria-hidden />
                  <dt>{t('pages.ticketsPage.date')}</dt>
                  <dd>{selectedEvent?.date ?? t('pages.ticketsPage.dateFallback')}</dd>
                </div>
                <div>
                  <MapPin size={16} aria-hidden />
                  <dt>{t('pages.ticketsPage.venue')}</dt>
                  <dd>{selectedEvent?.venue ?? t('pages.ticketsPage.venueFallback')}</dd>
                </div>
              </dl>
            </div>

            <aside className="tickets-page__quick-card" aria-label={t('pages.ticketsPage.quickCardAria')}>
              <Ticket size={22} aria-hidden />
              <span>{t('pages.ticketsPage.selectedEvent')}</span>
              <strong>{selectedEvent?.title ?? t('pages.ticketsPage.eventFallback')}</strong>
              <p>{t('pages.ticketsPage.noMembership')}</p>
            </aside>
          </div>
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
                  <em>{money(itemPricing.day, locale)} {t('pages.ticketsPage.fromPerDay')}</em>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <section className="tickets-page__offers tickets-page__shell" aria-label={t('pages.ticketsPage.offersAria')}>
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
      </section>

      <section className="tickets-page__checkout tickets-page__shell" aria-labelledby="tickets-checkout-title">
        <div className="tickets-page__checkout-head">
          <div>
            <span>{t('pages.ticketsPage.checkoutEyebrow')}</span>
            <h2 id="tickets-checkout-title">{t('pages.ticketsPage.checkoutTitle')}</h2>
            <p>{t('pages.ticketsPage.checkoutLead')}</p>
          </div>
          <div className="tickets-page__trust">
            <ShieldCheck size={17} aria-hidden />
            {t('pages.ticketsPage.secureFlow')}
          </div>
        </div>

        {ticketSalesOpen ? (
          <TicketPurchaseSection
            editorial
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
      </section>
    </main>
  )
}
