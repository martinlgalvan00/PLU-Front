import { Calendar, MapPin } from 'lucide-react'
import StatusPill from './StatusPill.jsx'
import SpotlightCard from './SpotlightCard.jsx'

export default function EventCard({
  date,
  title,
  venue,
  location,
  status,
  featured = false,
  onAction,
  actionLabel = 'Inscribirme',
}) {
  const closed = status === 'cerrado' || status === 'finalizado'

  return (
    <SpotlightCard as="article" className={`event-card ${featured ? 'event-card--featured' : ''}`}>
      <div className="event-card__top">
        <div className="event-card__date">
          <Calendar size={16} />
          {date}
        </div>
        {status && <StatusPill value={status} />}
      </div>
      <h3 className="event-card__title">{title}</h3>
      <p className="event-card__venue">{venue}</p>
      <p className="event-card__location">
        <MapPin size={14} />
        {location}
      </p>
      {onAction && !closed && (
        <button type="button" className="btn btn--small btn--block" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </SpotlightCard>
  )
}
