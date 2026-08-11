import { useI18n } from '../../i18n/I18nProvider.jsx'
import { LOW_AVAILABILITY_THRESHOLD } from '../../lib/ticketAvailability.js'

/**
 * Disponibilidad de entradas como meta editorial (cifra + label),
 * no como pill de status SaaS. El tono solo marca urgencia real.
 */
export default function TicketAvailabilityBadge({ remaining, className = '' }) {
  const { t } = useI18n()
  if (remaining == null) return null

  const soldOut = remaining <= 0
  const low = !soldOut && remaining <= LOW_AVAILABILITY_THRESHOLD
  const tone = soldOut ? 'sold-out' : low ? 'low' : 'available'

  if (soldOut) {
    return (
      <p className={`ticket-availability ticket-availability--${tone} ${className}`.trim()}>
        <span className="ticket-availability__label">{t('ticketAvailability.soldOut')}</span>
      </p>
    )
  }

  return (
    <p className={`ticket-availability ticket-availability--${tone} ${className}`.trim()}>
      <span className="ticket-availability__count">{remaining}</span>
      <span className="ticket-availability__copy">
        <span className="ticket-availability__eyebrow">
          {low ? t('ticketAvailability.lowStockEyebrow') : t('ticketAvailability.availableEyebrow')}
        </span>
        <span className="ticket-availability__label">{t('ticketAvailability.publicTickets')}</span>
      </span>
    </p>
  )
}
