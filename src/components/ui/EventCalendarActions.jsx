import { CalendarPlus } from 'lucide-react'
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
      {!compact && <p className="event-calendar-actions__label">{t('pages.events.addToCalendar')}</p>}
      <div className="event-calendar-actions__buttons">
        <Button
          variant="outline"
          className="btn--small"
          onClick={() => window.open(buildGoogleCalendarUrl(event), '_blank', 'noopener,noreferrer')}
        >
          <CalendarPlus size={14} aria-hidden />
          {t('pages.events.addToGoogleCalendar')}
        </Button>
        <Button variant="outline" className="btn--small" onClick={() => downloadIcs(event)}>
          <CalendarPlus size={14} aria-hidden />
          {t('pages.events.downloadIcs')}
        </Button>
      </div>
      {!compact && <p className="event-calendar-actions__hint">{t('pages.events.calendarIcsHint')}</p>}
    </div>
  )
}
