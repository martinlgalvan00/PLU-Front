import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { EVENT_STATUS } from '../../lib/events.js'
import { getStatusMeta } from '../../lib/status.js'

/** Tope de expansión de un evento multi-día: guarda ante startsAt/endsAt inconsistentes. */
const MAX_EVENT_SPAN_DAYS = 45
/** Semanas mínimas de la grilla, para que la altura no salte al cambiar de mes. */
const MIN_WEEKS = 5
/** Chips visibles por día antes de agrupar el resto en "+N". */
const MAX_CHIPS_PER_DAY = 2

function intlLocale(locale) {
  return locale === 'en' ? 'en-US' : 'es-AR'
}

function getWeekdayLabels(locale) {
  const formatter = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short' })
  const monday = new Date(2026, 0, 5)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    return formatter.format(date).replace('.', '')
  })
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function toDayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Día calendario de un ISO leído del string, no del `Date`: `new Date('2026-12-01')`
 * se interpreta como UTC y en AR (-03) cae el 30/11, lo que corría el mes del cursor.
 */
function isoDayKey(value) {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null
}

function dayKeyToDate(key) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function addDaysToKey(key, amount) {
  const date = dayKeyToDate(key)
  date.setDate(date.getDate() + amount)
  return toDayKey(date)
}

/** Todos los días que ocupa un evento. Un meet de 2 jornadas aparece en ambas. */
function getEventDayKeys(event) {
  const startKey = isoDayKey(event.startsAt) ?? isoDayKey(event.dateISO)
  if (!startKey) return []

  const endKey = isoDayKey(event.endsAt) ?? startKey
  if (endKey <= startKey) return [startKey]

  const keys = []
  let cursor = startKey
  while (cursor <= endKey && keys.length <= MAX_EVENT_SPAN_DAYS) {
    keys.push(cursor)
    cursor = addDaysToKey(cursor, 1)
  }
  return keys
}

function buildMonthCells(year, month) {
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const weeks = Math.max(MIN_WEEKS, Math.ceil((startOffset + daysInMonth) / 7))

  return Array.from({ length: weeks * 7 }, (_, index) => {
    const date = new Date(year, month, 1 - startOffset + index)
    return {
      date,
      key: toDayKey(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month && date.getFullYear() === year,
      isWeekStart: index % 7 === 0,
    }
  })
}

function monthFromISO(value, fallback) {
  const key = isoDayKey(value)
  if (!key) return fallback
  const date = dayKeyToDate(key)
  return { year: date.getFullYear(), month: date.getMonth() }
}

export default function EventCalendar({
  events = [],
  onEventSelect,
  initialDate,
  focusDateISO,
  selectedEventSlug,
}) {
  const { locale, t } = useI18n()
  const weekdays = useMemo(() => getWeekdayLabels(locale), [locale])
  const today = new Date()
  const todayMonth = { year: today.getFullYear(), month: today.getMonth() }
  const [cursor, setCursor] = useState(() => monthFromISO(initialDate, todayMonth))

  useEffect(() => {
    if (!focusDateISO) return
    setCursor((current) => monthFromISO(focusDateISO, current))
  }, [focusDateISO])

  const eventsByDay = useMemo(() => {
    const map = new Map()
    events.forEach((event) => {
      const dayKeys = getEventDayKeys(event)
      dayKeys.forEach((key, index) => {
        const list = map.get(key) ?? []
        list.push({
          event,
          isStart: index === 0,
          isEnd: index === dayKeys.length - 1,
          isSpan: dayKeys.length > 1,
        })
        map.set(key, list)
      })
    })
    return map
  }, [events])

  const nextEvent = useMemo(
    () => events.find((event) => event.status === 'inscripcion_abierta') ?? events[0],
    [events],
  )

  const cells = useMemo(() => buildMonthCells(cursor.year, cursor.month), [cursor])
  const todayKey = toDayKey(today)
  const isTodayVisible = cursor.year === todayMonth.year && cursor.month === todayMonth.month

  const monthTitle = new Intl.DateTimeFormat(intlLocale(locale), { month: 'long' }).format(
    new Date(cursor.year, cursor.month, 1),
  )
  const dayFormatter = new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  function shiftMonth(step) {
    setCursor((current) => {
      const date = new Date(current.year, current.month + step, 1)
      return { year: date.getFullYear(), month: date.getMonth() }
    })
  }

  return (
    <div className="event-calendar event-calendar--premium">
      <header className="event-calendar__header">
        <h3 className="event-calendar__title">
          {monthTitle} <span>{cursor.year}</span>
        </h3>
        <div className="event-calendar__controls">
          {!isTodayVisible && (
            <button
              type="button"
              className="event-calendar__today-btn"
              onClick={() => setCursor(todayMonth)}
            >
              {t('pages.events.calendarToday')}
            </button>
          )}
          <button
            type="button"
            className="event-calendar__nav"
            onClick={() => shiftMonth(-1)}
            aria-label={t('pages.events.calendarPrev')}
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <button
            type="button"
            className="event-calendar__nav"
            onClick={() => shiftMonth(1)}
            aria-label={t('pages.events.calendarNext')}
          >
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
      </header>

      <div className="event-calendar__weekdays">
        {weekdays.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="event-calendar__grid" key={`${cursor.year}-${cursor.month}`}>
        {cells.map((cell) => {
          const dayEntries = eventsByDay.get(cell.key) ?? []
          const hasEvent = dayEntries.length > 0
          const isSelected = dayEntries.some(({ event }) => event.slug === selectedEventSlug)
          const className = [
            'event-calendar__cell',
            cell.inMonth ? '' : 'event-calendar__cell--outside',
            cell.key === todayKey ? 'event-calendar__cell--today' : '',
            hasEvent ? 'event-calendar__cell--event' : '',
            isSelected ? 'event-calendar__cell--selected' : '',
          ]
            .filter(Boolean)
            .join(' ')

          const dayNumber = <span className="event-calendar__day">{cell.day}</span>

          if (!hasEvent) {
            return (
              <div key={cell.key} className={className}>
                {dayNumber}
              </div>
            )
          }

          const visible = dayEntries.slice(0, MAX_CHIPS_PER_DAY)
          const hiddenCount = dayEntries.length - visible.length

          return (
            <button
              key={cell.key}
              type="button"
              className={className}
              onClick={() => onEventSelect?.(dayEntries[0].event)}
              aria-pressed={isSelected}
              aria-label={`${dayFormatter.format(cell.date)}: ${dayEntries
                .map(({ event }) => event.title)
                .join(', ')}`}
            >
              {dayNumber}
              <span className="event-calendar__chips">
                {visible.map(({ event, isStart, isEnd, isSpan }) => (
                  <span
                    key={event.slug}
                    className={[
                      'event-calendar__chip',
                      `event-calendar__chip--${EVENT_STATUS[event.status]?.tone ?? 'neutral'}`,
                      isSpan ? 'event-calendar__chip--span' : '',
                      isSpan && isStart ? 'event-calendar__chip--span-start' : '',
                      isSpan && isEnd ? 'event-calendar__chip--span-end' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className="event-calendar__chip-label" aria-hidden>
                      {isStart || cell.isWeekStart ? event.title : ''}
                    </span>
                  </span>
                ))}
                {hiddenCount > 0 && (
                  <span className="event-calendar__chip-more" aria-hidden>
                    +{hiddenCount}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <footer className="event-calendar__footer">
        <div className="event-calendar__legend event-calendar__legend--compact">
          {Object.entries(EVENT_STATUS).slice(0, 3).map(([key, meta]) => (
            <span key={key} className="event-calendar__legend-item">
              <span className={`event-calendar__dot event-calendar__dot--${meta.tone}`} />
              {getStatusMeta(key, t).label}
            </span>
          ))}
        </div>
        {nextEvent && (
          <button
            type="button"
            className="event-calendar__jump"
            onClick={() => onEventSelect?.(nextEvent)}
          >
            <span className="event-calendar__jump-copy">
              <span className="event-calendar__jump-label">{t('pages.events.nextMeet')}</span>
              <strong>{nextEvent.title}</strong>
            </span>
            <ArrowRight size={16} aria-hidden />
          </button>
        )}
      </footer>
    </div>
  )
}
