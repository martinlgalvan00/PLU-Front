import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarClock, MapPin } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getPublicEventStatus } from '../../lib/publicRegistrationPhase.js'
import { getStatusMeta, isRegistrationOpen } from '../../lib/status.js'
import {
  getCountdownCells,
  getCountdownParts,
  resolveEventStartsAt,
} from '../../lib/countdown.js'
import '../../styles/components/event-countdown.css'

const MINUTE_MS = 60_000
const SECOND_MS = 1_000

/**
 * Countdown editorial al próximo evento.
 * Tres unidades contiguas con la misma regla que el resto de los contadores
 * (semanas · días · horas → días · horas · min → horas · min · seg), con
 * tipografía display y metadata del evento. Se actualiza cada minuto y solo
 * pasa a cada segundo en el último día, cuando los segundos se ven.
 */
export default function EventCountdown({
  event,
  onAction,
  onNavigate,
  actionLabel,
  className = '',
  compact = false,
}) {
  const { t } = useI18n()
  const startsAt = useMemo(() => resolveEventStartsAt(event), [event])
  const [parts, setParts] = useState(() => (startsAt ? getCountdownParts(startsAt) : null))
  const lastDay = Boolean(parts) && !parts.expired && parts.days === 0

  useEffect(() => {
    if (!startsAt) {
      setParts(null)
      return undefined
    }
    setParts(getCountdownParts(startsAt))
    const interval = setInterval(
      () => setParts(getCountdownParts(startsAt)),
      lastDay ? SECOND_MS : MINUTE_MS,
    )
    return () => clearInterval(interval)
  }, [startsAt, lastDay])

  const statusMeta = useMemo(
    () => (event?.status ? getStatusMeta(getPublicEventStatus(event), t) : null),
    [event, t],
  )

  if (!event || !parts || parts.expired) return null

  const unitLabel = (unit, value) => {
    const plural = value === 1 ? 'one' : 'other'
    if (unit === 'weeks') return t(`pages.events.countdownUnitWeek_${plural}`)
    if (unit === 'days') return t(`pages.events.countdownUnitDay_${plural}`)
    if (unit === 'hours') return t('pages.events.countdownHours')
    if (unit === 'minutes') return t('pages.events.countdownMinutes')
    return t('pages.events.countdownSeconds')
  }

  const place = [event.venue, event.location].filter(Boolean).join(' · ')
  const canAct = isRegistrationOpen(getPublicEventStatus(event))

  const units = getCountdownCells(parts).map(({ unit, value }) => ({
    key: unit,
    value,
    label: unitLabel(unit, value),
  }))

  if (compact) {
    return (
      <div
        className={['event-countdown', 'event-countdown--compact', className]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="event-countdown__ticker" aria-label={t('pages.events.nextMeet')}>
          {units.map(({ key, value, label }) => (
            <div key={key} className="event-countdown__unit">
              <span className="event-countdown__value">{String(value).padStart(2, '0')}</span>
              <span className="event-countdown__label">{label}</span>
            </div>
          ))}
        </div>

        <div className="event-countdown__info">
          <p className="event-countdown__eyebrow">{t('pages.events.nextMeet')}</p>
          {onNavigate ? (
            <button type="button" className="event-countdown__title-btn" onClick={onNavigate}>
              <span className="event-countdown__title">{event.title}</span>
              <ArrowRight size={14} aria-hidden className="event-countdown__title-arrow" />
            </button>
          ) : (
            <h3 className="event-countdown__title">{event.title}</h3>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={['event-countdown', className].filter(Boolean).join(' ')}>
      <div className="event-countdown__ticker">
        {units.map(({ key, value, label }) => (
          <div key={key} className="event-countdown__unit">
            <span className="event-countdown__value">{String(value).padStart(2, '0')}</span>
            <span className="event-countdown__label">{label}</span>
          </div>
        ))}
      </div>

      <div className="event-countdown__info">
        <div className="event-countdown__meta">
          {statusMeta ? (
            <span className={`event-countdown__badge event-countdown__badge--${statusMeta.tone}`}>
              {(statusMeta.tone === 'success' || statusMeta.tone === 'warning') && (
                <span className="event-countdown__pulse-dot" aria-hidden />
              )}
              {statusMeta.label}
            </span>
          ) : null}
          <CalendarClock
            size={13}
            strokeWidth={1.6}
            aria-hidden
            className="event-countdown__meta-icon"
          />
          <span className="event-countdown__eyebrow">{t('pages.events.nextMeet')}</span>
        </div>

        <h3 className="event-countdown__title">{event.title}</h3>

        {place ? (
          <p className="event-countdown__place">
            <MapPin size={13} strokeWidth={1.6} aria-hidden />
            {place}
          </p>
        ) : null}

        {(canAct && onAction) || onNavigate ? (
          <div className="event-countdown__actions">
            {canAct && onAction ? (
              <button
                type="button"
                className="event-countdown__cta motion-icon-shift"
                onClick={onAction}
              >
                <span>{actionLabel || t('pages.events.register')}</span>
                <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
              </button>
            ) : null}
            {onNavigate ? (
              <button type="button" className="event-countdown__link" onClick={onNavigate}>
                {t('pages.events.viewFull')}
                <ArrowRight size={13} aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
