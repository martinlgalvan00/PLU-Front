import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarClock, MapPin } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getStatusMeta } from '../../lib/status.js'
import { getTimeUntilEvent } from '../../lib/eventNavigation.js'
import '../../styles/components/event-countdown.css'

/**
 * Countdown editorial al próximo evento.
 * Muestra días | horas | min con tipografía display y metadata del evento.
 * Se actualiza cada 60 s — sin requestAnimationFrame ni polling agresivo.
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
  const [time, setTime] = useState(() => getTimeUntilEvent(event))

  useEffect(() => {
    if (!event) return
    setTime(getTimeUntilEvent(event))
    const interval = setInterval(() => setTime(getTimeUntilEvent(event)), 60_000)
    return () => clearInterval(interval)
  }, [event])

  const statusMeta = useMemo(
    () => (event?.status ? getStatusMeta(event.status, t) : null),
    [event?.status, t],
  )

  if (!event || !time || time.isPast) return null

  const place = [event.venue, event.location].filter(Boolean).join(' · ')
  const canAct = event.status === 'inscripcion_abierta' || event.status === 'cupos_limitados'

  const units = [
    {
      value: time.days,
      label: time.days === 1 ? t('pages.events.countdownUnitDay_one') : t('pages.events.countdownUnitDay_other'),
    },
    { value: time.hours, label: t('pages.events.countdownHours') },
    { value: time.minutes, label: t('pages.events.countdownMinutes') },
  ]

  if (compact) {
    return (
      <div className={['event-countdown', 'event-countdown--compact', className].filter(Boolean).join(' ')}>
        <div className="event-countdown__ticker" aria-label={t('pages.events.nextMeet')}>
          {units.map(({ value, label }) => (
            <div key={label} className="event-countdown__unit">
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
        {units.map(({ value, label }) => (
          <div key={label} className="event-countdown__unit">
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
          <CalendarClock size={13} strokeWidth={1.6} aria-hidden className="event-countdown__meta-icon" />
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
              <button type="button" className="event-countdown__cta motion-icon-shift" onClick={onAction}>
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
