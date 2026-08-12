import { ArrowRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getStatusMeta } from '../../lib/status.js'
import PitbullBrandMark from './PitbullBrandMark.jsx'
import SpotlightCard from './SpotlightCard.jsx'

const LIVE_STATUSES = new Set(['inscripcion_abierta', 'cupos_limitados'])
const PERSONAL_ATHLETE_STATUSES = new Set(['registered', 'pending_payment', 'needs_membership'])

export default function EventCard({
  date,
  title,
  venue,
  location,
  status,
  featured = false,
  selected = false,
  brand = null,
  athleteStatus = null,
  onAction,
  onSelect,
  actionLabel = 'Inscribirme',
  variant = 'default',
}) {
  const { t } = useI18n()
  const closed = status === 'cerrado' || status === 'finalizado'
  const [day, month] = date.split(' ')
  const { label: statusLabel, tone } = getStatusMeta(status, t)
  const isLive = LIVE_STATUSES.has(status)
  const secondaryLabel = t('pages.events.listViewEvent')
  const isMinimal = variant === 'minimal'
  const isPitbull = brand === 'pitbull'
  const hasPlace = Boolean(venue || location)
  const showAthleteStatus = PERSONAL_ATHLETE_STATUSES.has(athleteStatus)
  const athleteStatusLabel = showAthleteStatus
    ? t(`pages.events.athleteStatus.${athleteStatus}`)
    : null
  const athleteTone =
    athleteStatus === 'registered'
      ? 'success'
      : athleteStatus === 'pending_payment' || athleteStatus === 'needs_membership'
        ? 'warning'
        : athleteStatus === 'can_register'
          ? 'info'
          : 'neutral'

  return (
    <SpotlightCard
      as="article"
      className={[
        'event-card',
        isMinimal ? 'event-card--minimal' : '',
        featured ? 'event-card--featured' : '',
        selected ? 'event-card--selected' : '',
        isPitbull ? 'event-card--pitbull' : '',
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
        {!isMinimal && status ? (
          <p className="event-card__status" data-tone={tone}>
            <span className="event-card__status-dot" aria-hidden />
            {statusLabel}
          </p>
        ) : null}

        {athleteStatusLabel ? (
          <p className="event-card__athlete-status" data-tone={athleteTone}>
            {athleteStatusLabel}
          </p>
        ) : null}

        {isPitbull ? (
          <>
            <div className="event-card__brand">
              <PitbullBrandMark size="sm" label={title} />
            </div>
            <h3 className="event-card__title event-card__title--brand visually-hidden">{title}</h3>
          </>
        ) : (
          <h3 className="event-card__title">{title}</h3>
        )}

        {isMinimal ? (
          <p className="event-card__meta">
            {status ? (
              <span className="event-card__status event-card__status--inline" data-tone={tone}>
                {statusLabel}
              </span>
            ) : null}
            {status && hasPlace ? (
              <span className="event-card__meta-sep" aria-hidden>
                ·
              </span>
            ) : null}
            {venue ? <span>{venue}</span> : null}
            {venue && location ? (
              <span className="event-card__meta-sep" aria-hidden>
                ·
              </span>
            ) : null}
            {location ? <span>{location}</span> : null}
          </p>
        ) : hasPlace ? (
          <p className="event-card__meta">
            {venue ? <span>{venue}</span> : null}
            {venue && location ? (
              <span className="event-card__meta-sep" aria-hidden>
                ·
              </span>
            ) : null}
            {location ? <span>{location}</span> : null}
          </p>
        ) : null}
      </div>

      {onAction && !closed ? (
        <button
          type="button"
          className={[
            'event-card__action',
            'motion-icon-shift',
            isMinimal ? 'event-card__action--editorial' : '',
            isLive ? 'event-card__action--live' : 'event-card__action--quiet',
          ]
            .filter(Boolean)
            .join(' ')}
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
