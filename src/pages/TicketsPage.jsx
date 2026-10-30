import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Clock3, ShieldCheck } from 'lucide-react'
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
import TicketPassPreview from '../components/ui/TicketPassPreview.jsx'
import TicketPurchaseSection from '../components/ui/TicketPurchaseSection.jsx'
import TicketTypeOptions, { zoneScopeLabel } from '../components/ui/TicketTypeOptions.jsx'
import { zonesTicketsCanOpen } from '../services/securityZoneService.js'
import { useI18n } from '../i18n/I18nProvider.jsx'
import {
  useTicketAvailability,
  useTicketCheckoutAvailability,
} from '../hooks/useTicketAvailability.js'
import { getUpcomingEventsByDate } from '../lib/eventNavigation.js'
import {
  cheapestTicketTypePrice,
  shortTicketTypeName,
  ticketPricingFromEvent,
} from '../lib/eventPricing.js'
import { resolvePublicTicketOffer, ticketOfferCopyKey } from '../lib/ticketSalesState.js'
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
  // El interruptor del evento viaja en el mismo request que el cupo. Si ya
  // respondió, gana al catálogo: prender o apagar en el panel se ve sin esperar
  // a que la lista pública se refresque. Mientras no hay dato, manda el evento
  // que ya tiene la pantalla.
  const ticketCheckout = useTicketCheckoutAvailability(selectedEvent?.slug ?? null)
  const ticketOffer = useMemo(
    () =>
      resolvePublicTicketOffer({
        event: selectedEvent,
        live: ticketCheckout,
        checkoutOpen: paidCheckoutOpen,
      }),
    [paidCheckoutOpen, selectedEvent, ticketCheckout],
  )
  const ticketSalesOpen = ticketOffer.status === 'open'
  const ticketClosedLead =
    ticketOffer.status === 'blocked'
      ? t(ticketOfferCopyKey(ticketOffer))
      : t('pages.ticketsPage.salesPausedLead')
  const ticketClosedTitle =
    ticketOffer.status === 'blocked'
      ? t('pages.ticketOffer.blockedTitle')
      : t('pages.ticketsPage.salesPausedTitle')
  const availabilityRemaining = useTicketAvailability(ticketSalesOpen ? selectedEvent?.slug : null)
  const visibleCreatedOrder =
    createdOrder?.type === 'tickets' && createdOrder.eventTitle === selectedEvent?.title
      ? createdOrder
      : null

  const heroMark =
    String(selectedEvent?.title ?? '')
      .trim()
      .split(/\s+/)[0]
      ?.toUpperCase() || t('pages.ticketsPage.heroWatermark')

  // `visibleCreatedOrder` matchea por evento seleccionado: si la entrada
  // recuperada es de otro evento en venta (dos eventos con venta simultánea),
  // sin este ajuste el QR quedaba encontrado pero invisible -- la pantalla
  // seguía mostrando el evento por defecto.
  async function handleLookupTicketOrder(reference, email) {
    const result = await onLookupTicketOrder?.(reference, email)
    if (result?.order?.eventSlug) {
      const match = ticketEvents.find(
        (item) => (item.slug ?? item.id) === result.order.eventSlug,
      )
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

  return (
    <main className="tickets-page">
      <HeroRoot
        className={`tickets-page__hero${reducedMotion ? '' : ' tickets-page__hero--motion'}`}
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
            <button
              type="button"
              className="tickets-page__back"
              onClick={() => onNavigate('pitbull')}
            >
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
                <div
                  className="tickets-page__dateline"
                  aria-label={t('pages.ticketsPage.eventMetaAria')}
                >
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

              {!ticketSalesOpen && ticketOffer.status !== 'pending' ? (
                <Item {...itemProps}>
                  <p className="tickets-page__sales-paused" role="status">
                    <Clock3 size={15} aria-hidden />
                    <span>
                      {ticketOffer.status === 'blocked'
                        ? ticketClosedLead
                        : t('pages.ticketsPage.salesPaused')}
                    </span>
                  </p>
                </Item>
              ) : null}

              {ticketSalesOpen ? (
                <Item {...itemProps}>
                  <div className="tickets-page__hero-actions">
                    <a className="tickets-page__hero-cta motion-icon-shift" href="#checkout">
                      {t('pages.ticketsPage.heroCta')}
                      <ArrowRight
                        size={15}
                        aria-hidden
                        className="tickets-page__hero-cta-icon motion-icon-shift__target"
                      />
                    </a>
                    <a className="tickets-page__hero-link" href="#pass-preview">
                      {t('pages.ticketsPage.heroSeePass')}
                    </a>
                  </div>
                </Item>
              ) : null}
            </div>

            <Item {...itemProps} className="tickets-page__hero-visual">
              <TicketPassPreview
                eventTitle={selectedEvent?.title ?? t('pages.ticketsPage.eventFallback')}
                eventSlug={selectedEvent?.slug ?? selectedEvent?.id ?? ''}
                date={selectedEvent?.date ?? t('pages.ticketsPage.dateFallback')}
                venue={selectedEvent?.venue ?? t('pages.ticketsPage.venueFallback')}
                showHint={false}
              />
            </Item>
          </div>
        </div>
      </HeroRoot>

      <section
        id="pass-preview"
        className="tickets-page__pass tickets-page__shell"
        aria-labelledby="tickets-pass-title"
      >
        <header className="tickets-page__pass-head">
          <span className="tickets-page__eyebrow">
            {t('pages.ticketsPage.passShowcaseEyebrow')}
          </span>
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
        <section
          className="tickets-page__event-picker tickets-page__shell"
          aria-label={t('pages.ticketsPage.chooseEventAria')}
        >
          <div className="tickets-page__event-picker-head">
            <span>{t('pages.ticketsPage.chooseEventEyebrow')}</span>
            <h2>{t('pages.ticketsPage.chooseEventTitle')}</h2>
            <p>{t('pages.ticketsPage.chooseEventLead')}</p>
          </div>
          <div className="tickets-page__event-list" role="list">
            {ticketEvents.map((item) => {
              const itemId = item.id ?? item.slug ?? item.title
              const active =
                itemId === (selectedEvent?.id ?? selectedEvent?.slug ?? selectedEvent?.title)
              const itemPricing = ticketPricingFromEvent(item)
              const fromPrice = cheapestTicketTypePrice(itemPricing)
              const itemOffer = active
                ? ticketOffer
                : resolvePublicTicketOffer({ event: item, checkoutOpen: paidCheckoutOpen })
              const saleOpen = itemOffer.status === 'open'
              return (
                <button
                  key={itemId}
                  type="button"
                  className={[
                    'tickets-page__event-option',
                    active ? 'tickets-page__event-option--active' : '',
                    saleOpen ? '' : 'tickets-page__event-option--soon',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setSelectedEventId(itemId)}
                  role="listitem"
                >
                  <span>
                    {active
                      ? t('pages.ticketsPage.currentEvent')
                      : saleOpen
                        ? t('pages.ticketsPage.availableEvent')
                        : itemOffer.status === 'blocked'
                          ? t(ticketOfferCopyKey(itemOffer))
                          : t('pages.ticketsPage.salesPausedTitle')}
                  </span>
                  <strong>{item.title ?? t('pages.ticketsPage.eventFallback')}</strong>
                  <small>
                    {item.date ?? t('pages.ticketsPage.dateFallback')} ·{' '}
                    {item.venue ?? t('pages.ticketsPage.venueFallback')}
                  </small>
                  {saleOpen ? (
                    <em>
                      <span className="tickets-page__event-price">{money(fromPrice, locale)}</span>
                      <span className="tickets-page__event-price-note">
                        {t('pages.ticketsPage.fromPerDay')}
                      </span>
                    </em>
                  ) : active ? (
                    <em className="tickets-page__event-price-note">
                      {itemOffer.status === 'blocked'
                        ? t(ticketOfferCopyKey(itemOffer))
                        : t('pages.ticketsPage.salesPausedTitle')}
                    </em>
                  ) : null}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {ticketSalesOpen ? (
        <section
          className="tickets-page__offers tickets-page__shell"
          aria-labelledby="tickets-offers-title"
        >
          <header className="tickets-page__offers-head">
            <span className="tickets-page__eyebrow">{t('pages.ticketsPage.offersEyebrow')}</span>
            <h2 id="tickets-offers-title">{t('pages.ticketsPage.offersTitle')}</h2>
            <p>{t('pages.ticketsPage.offersLead')}</p>
          </header>

          {/* Los tipos se muestran con la misma pieza que usa el checkout: la
              vidriera y el paso donde se elige tienen que decir lo mismo. */}
          <TicketTypeOptions
            className="tickets-page__offers-grid"
            locale={locale}
            t={t}
            ticketTypes={pricing.ticketTypes}
          />

          <TicketAccessMatrix locale={locale} ticketTypes={pricing.ticketTypes} t={t} />
        </section>
      ) : null}

      <section
        id="checkout"
        className="tickets-page__checkout"
        aria-labelledby="tickets-checkout-title"
      >
        <div className="tickets-page__shell tickets-page__checkout-inner">
          <header className="tickets-page__checkout-head">
            <div className="tickets-page__checkout-copy">
              <span className="tickets-page__eyebrow">
                {ticketSalesOpen
                  ? t('pages.ticketsPage.checkoutEyebrow')
                  : t('pages.ticketsPage.salesPausedEyebrow')}
              </span>
              <h2 id="tickets-checkout-title">
                {ticketSalesOpen ? t('pages.ticketsPage.checkoutTitle') : ticketClosedTitle}
              </h2>
              <p className="tickets-page__checkout-lead">
                {ticketSalesOpen ? t('pages.ticketsPage.checkoutLead') : ticketClosedLead}
              </p>
            </div>
            <div className="tickets-page__checkout-meta">
              {ticketSalesOpen ? (
                <p className="tickets-page__trust">
                  <ShieldCheck size={16} aria-hidden />
                  {t('pages.ticketsPage.secureFlow')}
                </p>
              ) : null}
              {!visibleCreatedOrder ? (
                <TicketOrderLookup onLookup={handleLookupTicketOrder} />
              ) : null}
            </div>
          </header>

          <div className="tickets-page__checkout-panel">
            {ticketSalesOpen ? (
              <TicketPurchaseSection
                editorial
                showPassPreview={false}
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
                cashPayment={ticketCheckout.cashPayment ?? null}
                pricing={pricing}
                tickets={tickets}
                createdOrder={visibleCreatedOrder}
                onSubmit={onSubmitTicketPurchase}
                onUploadPaymentProof={onUploadPaymentProof}
              />
            ) : (
              <p className="tickets-page__closed">{ticketClosedLead}</p>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
