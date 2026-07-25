import { ArrowRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getStatusMeta } from '../../lib/status.js'
import SpotlightCard from './SpotlightCard.jsx'

const LIVE_STATUSES = new Set(['inscripcion_abierta', 'cupos_limitados'])

export default function EventCard({
  date,
  title,
  venue,
  location,
  status,
  featured = false,
  selected = false,
  onAction,
  onSelect,
  actionLabel = 'Inscribirme',
}) {
  const { t } = useI18n()
  const closed = status === 'cerrado' || status === 'finalizado'
  const [day, month] = date.split(' ')
  const { label: statusLabel, tone } = getStatusMeta(status, t)
  const isLive = LIVE_STATUSES.has(status)
  const secondaryLabel = t('pages.events.listViewEvent')

  return (
    <SpotlightCard
      as="article"
      className={[
        'event-card',
        featured ? 'event-card--featured' : '',
        selected ? 'event-card--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onSelect}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect()
              }
            }
          : undefined
      }
    >
      <div className="event-card__date-block" data-tone={tone}>
        <span className="event-card__day">{day}</span>
        <span className="event-card__month">{month}</span>
      </div>

      <div className="event-card__body">
        {status ? (
          <p className="event-card__status" data-tone={tone}>
            <span className="event-card__status-dot" aria-hidden />
            {statusLabel}
          </p>
        ) : null}

        <h3 className="event-card__title">{title}</h3>

        <p className="event-card__meta">
          <span>{venue}</span>
          {location ? (
            <>
              <span className="event-card__meta-sep" aria-hidden>
                ·
              </span>
              <span>{location}</span>
            </>
          ) : null}
        </p>
      </div>

      {onAction && !closed ? (
        <button
          type="button"
          className={
            isLive
              ? 'event-card__action event-card__action--live motion-icon-shift'
              : 'event-card__action event-card__action--quiet motion-icon-shift'
          }
          onClick={(event) => {
            event.stopPropagation()
            onAction?.()
          }}
        >
          <span>{isLive ? actionLabel : secondaryLabel}</span>
          <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
        </button>
      ) : null}
    </SpotlightCard>
  )
}
