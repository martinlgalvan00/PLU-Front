import { ArrowRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getStatusMeta } from '../../lib/status.js'
import { resolveEventLogo } from '../../lib/eventMark.js'
import SpotlightCard from './SpotlightCard.jsx'

const LIVE_STATUSES = new Set(['inscripcion_abierta', 'cupos_limitados'])
const PERSONAL_ATHLETE_STATUSES = new Set(['registered', 'pending_payment', 'needs_membership'])

export default function EventCard({
  date,
  title,
  slug,
  logoUrl = null,
  venue,
  location,
  status,
  featured = false,
  selected = false,
  brand = null,
  athleteStatus = null,
  ticketsAvailable = false,
  onAction,
  onSelect,
  actionLabel = 'Inscribirme',
  actionLive = null,
  variant = 'default',
}) {
  const { t } = useI18n()
  const closed = status === 'cerrado' || status === 'finalizado'
  const [day, month] = date.split(' ')
  const registrationLive = LIVE_STATUSES.has(status)
  // Inscripción cerrada + entradas en venta: el público no debe leer solo "Cerrado".
  const showTicketsCue = ticketsAvailable && !registrationLive && status !== 'finalizado'
  const { label: rawStatusLabel, tone: rawTone } = getStatusMeta(status, t)
  const statusLabel = showTicketsCue ? t('pages.events.ticketsOnSaleStatus') : rawStatusLabel
  const tone = showTicketsCue ? 'success' : rawTone
  const isLive = actionLive == null ? registrationLive : Boolean(actionLive)
  const secondaryLabel = t('pages.events.listViewEvent')
  const isMinimal = variant === 'minimal'
  const isPitbull = brand === 'pitbull'
  const eventLogo = resolveEventLogo({ slug, title, logoUrl })
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
                onSelect(event)
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

        {/* Mismo lockup para todos los meets: emblema + nombre en texto. El
            wordmark de Pitbull en la lista medía 22px de alto y no se leía en
            mobile, y el título real quedaba oculto. */}
        <div className="event-card__identity">
          {eventLogo ? (
            <span className="event-card__mark" aria-hidden="true">
              <img
                src={eventLogo}
                alt=""
                width={72}
                height={72}
                loading="lazy"
                decoding="async"
              />
            </span>
          ) : null}
          <h3 className="event-card__title">{title}</h3>
        </div>

        {isMinimal && status ? (
          <p className="event-card__status" data-tone={tone}>
            <span className="event-card__status-dot" aria-hidden />
            {statusLabel}
          </p>
        ) : null}

        {hasPlace ? (
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

      {onAction && (!closed || showTicketsCue) ? (
        <button
          type="button"
          className={[
            'event-card__action',
            'motion-icon-shift',
            isMinimal ? 'event-card__action--editorial' : '',
            isLive ? 'event-card__action--live' : 'event-card__action--quiet',
            showTicketsCue && !registrationLive ? 'event-card__action--tickets' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={(event) => {
            event.stopPropagation()
            onAction?.()
          }}
        >
          <span>{isLive || showTicketsCue ? actionLabel : secondaryLabel}</span>
          <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
        </button>
      ) : null}
    </SpotlightCard>
  )
}
