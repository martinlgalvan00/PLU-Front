import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m } from 'motion/react'
import { ArrowRight, CalendarDays, MapPin, X } from 'lucide-react'
import StatusPill from './StatusPill.jsx'
import TicketAvailabilityBadge from './TicketAvailabilityBadge.jsx'
import { useTicketAvailability } from '../../hooks/useTicketAvailability.js'
import { cheapestTicketTypePrice, isTicketSalesEnabled, ticketPricingFromEvent } from '../../lib/eventPricing.js'
import { money } from '../../lib/format.js'
import { drawerBackdropTransition, drawerTransition } from '../../motion/variants.ts'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'

/**
 * Vista rápida de un evento de la Tienda: entradas + merch en un panel
 * lateral, sin abandonar la grilla. La compra real sigue pasando por el
 * flujo de checkout (`onBuyTickets`); esto es solo el "quick look".
 */
export default function ShopEventDrawer({ open, event, locale, onClose, onBuyTickets, onViewEvent, t }) {
  const { reducedMotion } = useMotionConfig()
  const pricing = ticketPricingFromEvent(event)
  const fromPrice = cheapestTicketTypePrice(pricing)
  const salesOpen = isTicketSalesEnabled(event)
  const remaining = useTicketAvailability(open && salesOpen ? event?.slug : null)
  const soldOut = remaining === 0
  const priceLabel = !salesOpen
    ? t('pages.shop.salesClosed')
    : fromPrice == null
      ? t('pages.shop.ticketsAvailable')
      : t('pages.shop.fromPrice', { amount: money(fromPrice, locale) })

  useEffect(() => {
    if (!open) return undefined

    function handleKeyDown(keyEvent) {
      if (keyEvent.key === 'Escape') onClose?.()
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && event ? (
        <>
          <m.button
            type="button"
            className="shop-event-drawer__backdrop"
            aria-label={t('pages.shop.drawerClose')}
            onClick={onClose}
            initial={reducedMotion ? false : 'hidden'}
            animate="visible"
            exit="exit"
            variants={drawerBackdropTransition}
          />
          <m.aside
            className="shop-event-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t('pages.shop.drawerAria')}
            initial={reducedMotion ? false : 'hidden'}
            animate="visible"
            exit="exit"
            variants={drawerTransition}
          >
            <header className="shop-event-drawer__head">
              <div className="shop-event-drawer__head-copy">
                <div className="shop-event-drawer__eyebrow-row">
                  <span className="shop-event-drawer__eyebrow">{t('pages.shop.drawerEyebrow')}</span>
                  <StatusPill value={event.status} />
                </div>
                <h2 className="shop-event-drawer__title">{event.title}</h2>
                <p className="shop-event-drawer__meta">
                  <span className="shop-event-drawer__meta-item">
                    <CalendarDays size={13} aria-hidden />
                    {event.date}
                  </span>
                  <span className="shop-event-drawer__meta-sep" aria-hidden>
                    ·
                  </span>
                  <span className="shop-event-drawer__meta-item">
                    <MapPin size={13} aria-hidden />
                    {event.venue}
                  </span>
                </p>
              </div>
              <button type="button" className="shop-event-drawer__close" aria-label={t('pages.shop.drawerClose')} onClick={onClose}>
                <X size={18} aria-hidden />
              </button>
            </header>

            <div className="shop-event-drawer__body">
              <section className="shop-event-drawer__block shop-event-drawer__block--tickets" aria-labelledby="shop-drawer-tickets-title">
                <h3 id="shop-drawer-tickets-title" className="shop-event-drawer__block-title">
                  {t('pages.shop.drawerTicketsHeading')}
                </h3>

                <div className="shop-event-drawer__offer">
                  <div className="shop-event-drawer__offer-main">
                    {salesOpen && fromPrice != null ? (
                      <>
                        <span className="shop-event-drawer__price-caption">{t('pages.shop.fromPriceCaption')}</span>
                        <p className="shop-event-drawer__price">{money(fromPrice, locale)}</p>
                      </>
                    ) : (
                      <p className="shop-event-drawer__price shop-event-drawer__price--status">{priceLabel}</p>
                    )}
                  </div>
                  {salesOpen ? (
                    <TicketAvailabilityBadge remaining={remaining} className="shop-event-drawer__availability" />
                  ) : null}
                </div>

                <div className="shop-event-drawer__cta-wrap">
                  <button
                    type="button"
                    className="btn shop-event-drawer__cta"
                    disabled={!salesOpen || soldOut}
                    onClick={() => onBuyTickets(event)}
                  >
                    <span>{t('pages.shop.buyTickets')}</span>
                    <ArrowRight size={16} aria-hidden />
                  </button>
                  {salesOpen && !soldOut ? (
                    <p className="shop-event-drawer__cta-hint">{t('pages.shop.drawerTicketsHint')}</p>
                  ) : null}
                </div>
              </section>

              <section className="shop-event-drawer__block shop-event-drawer__block--merch" aria-labelledby="shop-drawer-merch-title">
                <div className="shop-event-drawer__merch-head">
                  <h3 id="shop-drawer-merch-title" className="shop-event-drawer__block-title">
                    {t('pages.shop.merchTitle')}
                  </h3>
                  <span className="shop-event-drawer__soon">{t('pages.shop.merchSoon')}</span>
                </div>
                <p className="shop-event-drawer__text">{t('pages.shop.merchText')}</p>
              </section>
            </div>

            <footer className="shop-event-drawer__foot">
              <button type="button" className="shop-event-drawer__view-link" onClick={() => onViewEvent(event)}>
                {t('pages.shop.drawerViewEvent')}
                <ArrowRight size={15} aria-hidden />
              </button>
            </footer>
          </m.aside>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
