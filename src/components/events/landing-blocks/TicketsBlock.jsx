import { money } from '../../../lib/format.js'
import {
  cheapestTicketTypePrice,
  ticketPricingFromEvent,
} from '../../../lib/eventPricing.js'
import { canBuyEventTickets } from '../../../lib/eventPublicActions.js'
import BlockShell from './BlockShell.jsx'

export default function TicketsBlock({ block, ctx }) {
  const { event, locale, t, onNavigate } = ctx
  if (!canBuyEventTickets(event)) return null
  const price = cheapestTicketTypePrice(ticketPricingFromEvent(event))
  return (
    <BlockShell
      id={block.id}
      type="tickets"
      eyebrow={t('pages.events.publicTicketsEyebrow')}
      title={t('pages.events.publicTicketsTitle')}
      lead={t('pages.events.publicTicketsLead')}
    >
      <p className="lb-tickets">
        {price ? (
          <span className="lb-tickets__price">
            {t('pages.events.publicTicketsFrom', { price: money(price, locale) })}
          </span>
        ) : null}
        <button
          className="lb-button"
          type="button"
          onClick={() => onNavigate?.('tickets', { eventSlug: event.slug })}
        >
          {t('pages.events.publicTicketsCta')}
        </button>
      </p>
    </BlockShell>
  )
}
