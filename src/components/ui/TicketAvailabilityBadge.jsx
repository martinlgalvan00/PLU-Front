import { useI18n } from '../../i18n/I18nProvider.jsx'
import { LOW_AVAILABILITY_THRESHOLD } from '../../lib/ticketAvailability.js'
import Pill from './Pill.jsx'

export default function TicketAvailabilityBadge({ remaining, className = '' }) {
  const { t } = useI18n()
  if (remaining == null) return null

  const soldOut = remaining <= 0
  const low = !soldOut && remaining <= LOW_AVAILABILITY_THRESHOLD
  const tone = soldOut ? 'danger' : low ? 'warning' : 'success'
  const label = soldOut
    ? t('ticketAvailability.soldOut')
    : low
      ? t('ticketAvailability.lowStock', { count: remaining })
      : t('ticketAvailability.availableCount', { count: remaining })

  return (
    <Pill tone={tone} className={className}>
      {label}
    </Pill>
  )
}
