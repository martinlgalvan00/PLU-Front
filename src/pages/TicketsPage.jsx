import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, Clock3, MapPin } from 'lucide-react'
import { m } from 'motion/react'
import heroPhoto from '../assets/DSC00392-display.jpg'
import heroPhotoAvif from '../assets/DSC00392-display.avif'
import heroPhotoAvif480 from '../assets/DSC00392-display-480.avif'
import heroPhotoAvif800 from '../assets/DSC00392-display-800.avif'
import heroPhotoWebp from '../assets/DSC00392-display.webp'
import heroPhotoWebp480 from '../assets/DSC00392-display-480.webp'
import heroPhotoWebp800 from '../assets/DSC00392-display-800.webp'
import ResponsivePhoto from '../components/ui/ResponsivePhoto.jsx'
import TicketAvailabilityBadge from '../components/ui/TicketAvailabilityBadge.jsx'
import TicketOrderLookup from '../components/ui/TicketOrderLookup.jsx'
import TicketPurchaseSection from '../components/ui/TicketPurchaseSection.jsx'
import { zoneScopeLabel } from '../components/ui/TicketTypeOptions.jsx'
import { zonesTicketsCanOpen } from '../services/securityZoneService.js'
import { useI18n } from '../i18n/I18nProvider.jsx'
import {
  useTicketAvailability,
  useTicketCheckoutAvailability,
} from '../hooks/useTicketAvailability.js'
import { getUpcomingEventsByDate } from '../lib/eventNavigation.js'
import { getTicketsRouteOrderReference } from '../lib/ticketsRoute.js'
import { ACCOUNT_TICKETS_TAB } from '../lib/navigation.js'
import {
  cheapestTicketTypePrice,
  isTicketSalesEnabled,
  shortTicketTypeName,
  ticketPricingFromEvent,
} from '../lib/eventPricing.js'
import { env } from '../config/env.js'
import { isPaidCheckoutOpen } from '../lib/registrationSchedule.js'
import { money } from '../lib/format.js'
import { useMotionConfig } from '../motion/MotionProvider.tsx'
import { heroSequenceItem, heroStaggerContainer } from '../motion/variants.ts'
import '../styles/pages/tickets.css'

/**
 * Qué zona abre cada tipo de entrada.
 *
 * Contesta lo que la lista de tipos no puede: qué NO abre ninguna entrada. Las
 * filas salen de `zonesTicketsCanOpen()`, o sea de las zonas que el escáner
 * acepta leer con una credencial de entrada, así que la tabla no puede ofrecer
 * una zona que ninguna entrada habilite. Con un solo tipo no hay nada que
 * comparar y no se dibuja.
 */
function TicketAccessMatrix({ locale, ticketTypes = [], t }) {
  const zones = zonesTicketsCanOpen()
  if (ticketTypes.length < 2 || zones.length === 0) return null
  const labelOf = (type) => shortTicketTypeName(type.name, locale)

  return (
    <div className="tickets-page__access">
      <header className="tickets-page__access-head">
        <span className="tickets-page__eyebrow">{t('pages.ticketsPage.accessEyebrow')}</span>
        <h3>{t('pages.ticketsPage.accessTitle')}</h3>
        <p>{t('pages.ticketsPage.accessLead')}</p>
      </header>

      <div className="tickets-page__access-board" aria-label={t('pages.ticketsPage.accessAria')}>
        {zones.map((scope) => {
          const included = ticketTypes.filter((type) => (type.zoneScopes ?? []).includes(scope))
          const excluded = ticketTypes.filter((type) => !(type.zoneScopes ?? []).includes(scope))
          const opensAll = included.length === ticketTypes.length

          return (
            <article
              key={scope}
              className={[
                'tickets-page__access-zone',
                opensAll ? 'tickets-page__access-zone--all' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <header className="tickets-page__access-zone-head">
                <h4>{zoneScopeLabel(scope, t)}</h4>
                <p>{t(`pages.tickets.ticketTypes.zoneHint.${scope}`)}</p>
              </header>

              <div className="tickets-page__access-grant">
                <p className="tickets-page__access-kicker">{t('pages.ticketsPage.accessOpens')}</p>
                {opensAll ? (
                  <p className="tickets-page__access-all">{t('pages.ticketsPage.accessAll')}</p>
                ) : (
                  <ul className="tickets-page__access-opens">
                    {included.map((type) => (
                      <li key={type.id}>{labelOf(type)}</li>
                    ))}
                  </ul>
                )}
                {excluded.length ? (
                  <p className="tickets-page__access-closed">
                    <span>{t('pages.ticketsPage.accessClosed')}</span>
                    {excluded.map((type) => labelOf(type)).join(' · ')}
                  </p>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>

      <p className="tickets-page__access-note">{t('pages.ticketsPage.accessFootnote')}</p>
    </div>
  )
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
  account = null,
  createdOrder,
  onNavigate,
  onLookupTicketOrder,
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
    ticketEvents.find((item) => (item.id ?? item.slug ?? item.title) === selectedEventId) ??
    ticketEvents[0] ??
    event
  const pricing = ticketPricingFromEvent(selectedEvent)
  const paidCheckoutOpen = isPaidCheckoutOpen(selectedEvent, env, new Date(), {
    checkoutKind: 'ticket',
  })
  const eventSalesOpen =
    env.ticketSalesEnabled && paidCheckoutOpen && isTicketSalesEnabled(selectedEvent)
  // El interruptor global del panel se pide con el mismo request que el cupo, así
  // que se consulta con el slug del evento aunque la venta ya esté cerrada por
  // fecha o por configuración del torneo.
  const ticketCheckout = useTicketCheckoutAvailability(selectedEvent?.slug ?? null)
  const ticketSalesOpen = eventSalesOpen && ticketCheckout.ticketEnabled
  const availabilityRemaining = useTicketAvailability(ticketSalesOpen ? selectedEvent?.slug : null)
  const visibleCreatedOrder =
    createdOrder?.type === 'tickets' && createdOrder.eventTitle === selectedEvent?.title
      ? createdOrder
      : null

  // `visibleCreatedOrder` matchea por evento seleccionado: si la entrada
  // recuperada es de otro evento en venta (dos eventos con venta simultánea),
  // sin este ajuste el QR quedaba encontrado pero invisible -- la pantalla
  // seguía mostrando el evento por defecto.
  async function handleLookupTicketOrder(reference, email) {
    const result = await onLookupTicketOrder?.(reference, email)
    if (result?.order?.eventSlug) {
      const match = ticketEvents.find((item) => (item.slug ?? item.id) === result.order.eventSlug)
      if (match) setSelectedEventId(match.id ?? match.slug ?? match.title)
    }
    return result
  }

  useEffect(() => {
    setSelectedEventId(resolveInitialEventId(initialEventSlug, ticketEvents, event))
  }, [event, initialEventSlug, ticketEvents])

  const Item = reducedMotion ? 'div' : m.div
  const itemProps = reducedMotion ? {} : { variants: heroSequenceItem }
  const HeroRoot = reducedMotion ? 'section' : m.section
  const heroRootProps = reducedMotion
    ? {}
    : { initial: 'hidden', animate: 'visible', variants: heroStaggerContainer }
  const [lookupFromLink] = useState(() => Boolean(getTicketsRouteOrderReference()))
  const selectedEventKey = selectedEvent?.id ?? selectedEvent?.slug ?? selectedEvent?.title

  return (
    <main className="tickets-page">
      {/* Cabecera compacta: qué evento, cuándo y dónde. La compra empieza
          inmediatamente debajo, sin una portada que haya que atravesar. */}
      <HeroRoot
        className="tickets-page__hero"
        aria-labelledby="tickets-page-title"
        {...heroRootProps}
      >
        <div className="tickets-page__hero-backdrop" aria-hidden>
          <ResponsivePhoto
            className="tickets-page__hero-backdrop-img"
            avif={{ 480: heroPhotoAvif480, 800: heroPhotoAvif800, 1153: heroPhotoAvif }}
            webp={{ 480: heroPhotoWebp480, 800: heroPhotoWebp800, 1153: heroPhotoWebp }}
            src={heroPhoto}
            alt=""
            sizes="100vw"
            loading="eager"
            fetchPriority="high"
          />
        </div>

        <div className="tickets-page__shell tickets-page__hero-inner">
          <Item {...itemProps}>
            <button
              type="button"
              className="tickets-page__back"
              onClick={() => onNavigate('pitbull')}
            >
              <ArrowLeft size={15} aria-hidden />
              {t('pages.ticketsPage.backToEvent')}
            </button>
          </Item>

          <div className="tickets-page__hero-copy">
            <Item {...itemProps}>
              <p className="tickets-page__eyebrow">{t('pages.ticketsPage.eyebrow')}</p>
            </Item>
            <Item {...itemProps}>
              <h1 id="tickets-page-title">
                {selectedEvent?.title ?? t('pages.ticketsPage.title')}
              </h1>
            </Item>
            <Item {...itemProps}>
              <p
                className="tickets-page__dateline"
                aria-label={t('pages.ticketsPage.eventMetaAria')}
              >
                <span className="tickets-page__dateline-date">
                  <CalendarDays size={15} aria-hidden />
                  {selectedEvent?.date ?? t('pages.ticketsPage.dateFallback')}
                </span>
                <span className="tickets-page__dateline-venue">
                  <MapPin size={15} aria-hidden />
                  {selectedEvent?.venue ?? t('pages.ticketsPage.venueFallback')}
                </span>
              </p>
            </Item>
            <Item {...itemProps} className="tickets-page__hero-status">
              {ticketSalesOpen ? (
                availabilityRemaining != null ? (
                  <TicketAvailabilityBadge remaining={availabilityRemaining} />
                ) : null
              ) : (
                <p className="tickets-page__sales-paused" role="status">
                  <Clock3 size={15} aria-hidden />
                  <span>{t('pages.ticketsPage.salesPaused')}</span>
                </p>
              )}
            </Item>
          </div>
        </div>
      </HeroRoot>

      <section
        id="checkout"
        className="tickets-page__checkout tickets-page__shell"
        aria-label={t('pages.ticketsPage.checkoutTitle')}
      >
        {ticketEvents.length > 1 ? (
          <div
            className="tickets-page__event-picker"
            role="group"
            aria-label={t('pages.ticketsPage.chooseEventAria')}
          >
            {ticketEvents.map((item) => {
              const itemId = item.id ?? item.slug ?? item.title
              const active = itemId === selectedEventKey
              const fromPrice = cheapestTicketTypePrice(ticketPricingFromEvent(item))
              return (
                <button
                  key={itemId}
                  type="button"
                  className={[
                    'tickets-page__event-option',
                    active ? 'tickets-page__event-option--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={active}
                  onClick={() => setSelectedEventId(itemId)}
                >
                  <strong>{item.title ?? t('pages.ticketsPage.eventFallback')}</strong>
                  <small>
                    {item.date ?? t('pages.ticketsPage.dateFallback')}
                    {fromPrice != null
                      ? ` · ${t('pages.shop.fromPrice', { amount: money(fromPrice, locale) })}`
                      : ''}
                  </small>
                </button>
              )
            })}
          </div>
        ) : null}

        {/* Quien llega con el link del mail viene a recuperar su entrada: la
            búsqueda va arriba y abierta. El resto viene a comprar, y la
            búsqueda queda al pie. */}
        {lookupFromLink && !visibleCreatedOrder ? (
          <TicketOrderLookup onLookup={handleLookupTicketOrder} />
        ) : null}

        {ticketSalesOpen ? (
          <TicketPurchaseSection
            // Cambiar de evento arranca una compra nueva: los tipos, precios y
            // medios son otros, y el paso en el que estaba deja de aplicar.
            key={selectedEventKey}
            editorial
            event={selectedEvent}
            manualPaymentEnabled={
              ticketCheckout.channels
                ? ticketCheckout.channels.bank_transfer === true
                : ticketCheckout.ticketManualEnabled !== false
            }
            mercadoPagoEnabled={ticketCheckout.channels?.mercado_pago !== false}
            // Efectivo y Wise sólo si la celda viene explícitamente abierta:
            // ofrecerlos por omisión es prometer un medio que rebota al
            // confirmar la compra.
            cashEnabled={ticketCheckout.channels?.cash_pitbull === true}
            wiseEnabled={ticketCheckout.channels?.wise_transfer === true}
            accountDetails={ticketCheckout.bankTransfer ?? null}
            pricing={pricing}
            tickets={tickets}
            account={account}
            onOpenMyTickets={() => onNavigate('profile', { tab: ACCOUNT_TICKETS_TAB })}
            onCreateAccount={() => onNavigate('register')}
            createdOrder={visibleCreatedOrder}
            onSubmit={onSubmitTicketPurchase}
            onUploadPaymentProof={onUploadPaymentProof}
          />
        ) : (
          <div className="tickets-page__closed">
            <h2>{t('pages.ticketsPage.salesPausedTitle')}</h2>
            <p>{t('pages.ticketsPage.salesPausedLead')}</p>
          </div>
        )}
      </section>

      {!visibleCreatedOrder ? (
        <section className="tickets-page__more tickets-page__shell">
          {!lookupFromLink ? <TicketOrderLookup onLookup={handleLookupTicketOrder} /> : null}
          {ticketSalesOpen ? (
            <TicketAccessMatrix locale={locale} ticketTypes={pricing.ticketTypes} t={t} />
          ) : null}
        </section>
      ) : null}
    </main>
  )
}
