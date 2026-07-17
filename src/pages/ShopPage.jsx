import { CalendarDays, MapPin, Ticket } from 'lucide-react'
import PageFrame from '../components/layout/PageFrame.jsx'
import { InfoCard } from '../components/ui/Cards.jsx'
import StatusPill from '../components/ui/StatusPill.jsx'
import TicketAvailabilityBadge from '../components/ui/TicketAvailabilityBadge.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { useTicketAvailability } from '../hooks/useTicketAvailability.js'
import { getUpcomingEventsByDate } from '../lib/eventNavigation.js'
import { ticketPricingFromEvent } from '../lib/eventPricing.js'
import { money } from '../lib/format.js'
import '../styles/pages/shop.css'

/**
 * Una tarjeta por evento publicado: nada acá está hardcodeado a un evento
 * puntual, así que un evento nuevo dado de alta en el panel de admin
 * aparece solo en esta grilla apenas se publica, sin tocar código.
 */
function ShopEventCard({ event, locale, onBuyTickets, t }) {
  const pricing = ticketPricingFromEvent(event)
  const ticketsOpen = pricing.day > 0 || pricing.bothDays > 0
  const salesOpen = event?.pricing?.ticketsEnabled !== false && ticketsOpen
  const fromPrice = pricing.bothDays || pricing.day
  const remaining = useTicketAvailability(salesOpen ? event.slug : null)
  const soldOut = remaining === 0

  return (
    <article className="shop-event-card">
      <StatusPill value={event.status} />
      <h3 className="shop-event-card__title">{event.title}</h3>
      <p className="shop-event-card__meta">
        <CalendarDays size={13} aria-hidden />
        {event.date}
        <span className="shop-event-card__meta-sep" aria-hidden>·</span>
        <MapPin size={13} aria-hidden />
        {event.venue}
      </p>
      <TicketAvailabilityBadge remaining={remaining} />
      <div className="shop-event-card__footer">
        <p className="shop-event-card__price">
          {salesOpen
            ? t('pages.shop.fromPrice', { amount: money(fromPrice, locale) })
            : t('pages.shop.salesClosed')}
        </p>
        <button
          type="button"
          className="btn shop-event-card__cta"
          disabled={!salesOpen || soldOut}
          onClick={() => onBuyTickets(event)}
        >
          <Ticket size={14} aria-hidden />
          {t('pages.shop.buyTickets')}
        </button>
      </div>
    </article>
  )
}

export default function ShopPage({ events = [], onNavigate }) {
  const { locale, t } = useI18n()
  const shopEvents = getUpcomingEventsByDate(events)

  function handleBuyTickets(event) {
    onNavigate('tickets', { eventSlug: event.slug ?? event.id })
  }

  return (
    <PageFrame eyebrow={t('pages.shop.eyebrow')} title={t('pages.shop.title')}>
      <section className="shop-section" aria-labelledby="shop-tickets-title">
        <h2 id="shop-tickets-title" className="shop-section__title">
          {t('pages.shop.ticketsHeading')}
        </h2>
        {shopEvents.length > 0 ? (
          <div className="shop-events-grid">
            {shopEvents.map((event) => (
              <ShopEventCard
                key={event.slug ?? event.id ?? event.title}
                event={event}
                locale={locale}
                onBuyTickets={handleBuyTickets}
                t={t}
              />
            ))}
          </div>
        ) : (
          <p className="shop-section__empty">{t('pages.shop.noEvents')}</p>
        )}
      </section>

      <section className="shop-section" aria-labelledby="shop-more-title">
        <h2 id="shop-more-title" className="shop-section__title">
          {t('pages.shop.moreHeading')}
        </h2>
        <div className="content-grid">
          <InfoCard title={t('pages.shop.merchTitle')} text={t('pages.shop.merchText')} />
          <InfoCard
            title={t('pages.shop.registrationsTitle')}
            text={t('pages.shop.registrationsText')}
            action={t('pages.shop.registrationsAction')}
            onAction={() => onNavigate('events')}
          />
        </div>
      </section>
    </PageFrame>
  )
}
