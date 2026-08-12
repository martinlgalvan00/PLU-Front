import { CalendarPlus, Download } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { buildGoogleCalendarUrl, downloadIcs } from '../../lib/calendar.js'
import Button from './Button.jsx'

export default function EventCalendarActions({ event, className = '', compact = false, variant = 'default' }) {
  const { t } = useI18n()

  if (!event?.startsAt || !event?.endsAt) {
    return null
  }

  const isMinimal = variant === 'minimal'

  if (isMinimal) {
    const googleLabel = t('pages.events.addToGoogleCalendar')
    const icsLabel = t('pages.events.downloadIcs')

    return (
      <div
        className={['event-calendar-actions', 'event-calendar-actions--minimal', className]
          .filter(Boolean)
          .join(' ')}
      >
        <p className="event-calendar-actions__label">{t('pages.events.addToCalendar')}</p>
        <div className="event-calendar-actions__links" role="group" aria-label={t('pages.events.addToCalendar')}>
          <button
            type="button"
            className="event-calendar-actions__text-link"
            aria-label={googleLabel}
            onClick={() => window.open(buildGoogleCalendarUrl(event), '_blank', 'noopener,noreferrer')}
          >
            <CalendarPlus size={13} strokeWidth={1.6} aria-hidden />
            <span>{t('pages.events.addToGoogleCalendarShort')}</span>
          </button>
          <span className="event-calendar-actions__sep" aria-hidden />
          <button
            type="button"
            className="event-calendar-actions__text-link"
            aria-label={icsLabel}
            onClick={() => downloadIcs(event)}
          >
            <Download size={13} strokeWidth={1.6} aria-hidden />
            <span>{t('pages.events.downloadIcsShort')}</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={[
        'event-calendar-actions',
        compact ? 'event-calendar-actions--compact' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <p className="event-calendar-actions__label">{t('pages.events.addToCalendar')}</p>
      <div className="event-calendar-actions__buttons">
        <Button
          variant="outline"
          className="event-calendar-actions__btn event-calendar-actions__btn--google"
          onClick={() => window.open(buildGoogleCalendarUrl(event), '_blank', 'noopener,noreferrer')}
        >
          <CalendarPlus size={14} strokeWidth={2} aria-hidden />
          <span>{t('pages.events.addToGoogleCalendar')}</span>
        </Button>
        <Button
          variant="outline"
          className="event-calendar-actions__btn event-calendar-actions__btn--ics"
          onClick={() => downloadIcs(event)}
        >
          <Download size={14} strokeWidth={2} aria-hidden />
          <span>{t('pages.events.downloadIcs')}</span>
        </Button>
      </div>
      {!compact && <p className="event-calendar-actions__hint">{t('pages.events.calendarIcsHint')}</p>}
    </div>
  )
}
