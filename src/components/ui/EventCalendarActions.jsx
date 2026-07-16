import { CalendarPlus, Download } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { buildGoogleCalendarUrl, downloadIcs } from '../../lib/calendar.js'
import Button from './Button.jsx'

export default function EventCalendarActions({ event, className = '', compact = false }) {
  const { t } = useI18n()

  if (!event?.startsAt || !event?.endsAt) {
    return null
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
