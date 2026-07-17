import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m } from 'motion/react'
import { ArrowRight, CalendarDays, MapPin, ShoppingBag, Ticket, X } from 'lucide-react'
import StatusPill from './StatusPill.jsx'
import TicketAvailabilityBadge from './TicketAvailabilityBadge.jsx'
import { useTicketAvailability } from '../../hooks/useTicketAvailability.js'
import { ticketPricingFromEvent } from '../../lib/eventPricing.js'
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
  const ticketsOpen = pricing.day > 0 || pricing.bothDays > 0
  const salesOpen = event?.pricing?.ticketsEnabled !== false && ticketsOpen
  const fromPrice = pricing.bothDays || pricing.day
  const remaining = useTicketAvailability(open && salesOpen ? event?.slug : null)
  const soldOut = remaining === 0

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
                <StatusPill value={event.status} />
                <h2 className="shop-event-drawer__title">{event.title}</h2>
                <p className="shop-event-drawer__meta">
                  <CalendarDays size={13} aria-hidden />
                  {event.date}
                  <span className="shop-event-drawer__meta-sep" aria-hidden>
                    ·
                  </span>
                  <MapPin size={13} aria-hidden />
                  {event.venue}
                </p>
              </div>
              <button type="button" className="shop-event-drawer__close" aria-label={t('pages.shop.drawerClose')} onClick={onClose}>
                <X size={18} aria-hidden />
              </button>
            </header>

            <div className="shop-event-drawer__body">
              <section className="shop-event-drawer__block" aria-labelledby="shop-drawer-tickets-title">
                <h3 id="shop-drawer-tickets-title" className="shop-event-drawer__block-title">
                  <Ticket size={15} aria-hidden />
                  {t('pages.shop.drawerTicketsHeading')}
                </h3>
                <TicketAvailabilityBadge remaining={remaining} />
                <p className="shop-event-drawer__price">
                  {salesOpen
                    ? t('pages.shop.fromPrice', { amount: money(fromPrice, locale) })
                    : t('pages.shop.salesClosed')}
                </p>
                <button
                  type="button"
                  className="btn shop-event-drawer__cta"
                  disabled={!salesOpen || soldOut}
                  onClick={() => onBuyTickets(event)}
                >
                  <Ticket size={15} aria-hidden />
                  {t('pages.shop.buyTickets')}
                </button>
              </section>

              <section className="shop-event-drawer__block" aria-labelledby="shop-drawer-merch-title">
                <h3 id="shop-drawer-merch-title" className="shop-event-drawer__block-title">
                  <ShoppingBag size={15} aria-hidden />
                  {t('pages.shop.merchTitle')}
                </h3>
                <p className="shop-event-drawer__text">{t('pages.shop.merchText')}</p>
                <span className="shop-event-drawer__soon">{t('pages.shop.merchSoon')}</span>
              </section>
            </div>

            <footer className="shop-event-drawer__foot">
              <button type="button" className="shop-event-drawer__view-link" onClick={() => onViewEvent(event)}>
                {t('pages.shop.drawerViewEvent')}
                <ArrowRight size={14} aria-hidden />
              </button>
            </footer>
          </m.aside>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
