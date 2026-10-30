import { money } from '../../../lib/format.js'
import {
  cheapestTicketTypePrice,
  ticketPricingFromEvent,
} from '../../../lib/eventPricing.js'
import { ticketOfferCopyKey } from '../../../lib/ticketSalesState.js'
import { usePublicTicketOffer } from '../../../hooks/useTicketAvailability.js'
import BlockShell from './BlockShell.jsx'

export default function TicketsBlock({ block, ctx }) {
  const { event, locale, t, onNavigate } = ctx
  const offer = usePublicTicketOffer(event)
  // Apagado o todavía sin dato: el bloque no anuncia una venta que no existe.
  // Si el interruptor está prendido pero otro corte la frena, el motivo se ve.
  if (offer.status !== 'open' && offer.status !== 'blocked') return null
  const price = cheapestTicketTypePrice(ticketPricingFromEvent(event))
  const blocked = offer.status === 'blocked'
  return (
    <BlockShell
      id={block.id}
      type="tickets"
      eyebrow={t('pages.events.publicTicketsEyebrow')}
      title={t('pages.events.publicTicketsTitle')}
      lead={blocked ? t(ticketOfferCopyKey(offer)) : t('pages.events.publicTicketsLead')}
    >
      <p className="lb-tickets">
        {!blocked && price ? (
          <span className="lb-tickets__price">
            {t('pages.events.publicTicketsFrom', { price: money(price, locale) })}
          </span>
        ) : null}
        {blocked ? null : (
          <button
            className="lb-button"
            type="button"
            onClick={() => onNavigate?.('tickets', { eventSlug: event.slug })}
          >
            {t('pages.events.publicTicketsCta')}
          </button>
        )}
      </p>
    </BlockShell>
  )
}
