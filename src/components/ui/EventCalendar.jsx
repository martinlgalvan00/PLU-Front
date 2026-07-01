import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { EVENT_STATUS } from '../../lib/events.js'

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function toKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1)
  const startOffset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []

  for (let i = 0; i < startOffset; i += 1) cells.push(null)
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day)

  return cells
}

export default function EventCalendar({
  events = [],
  onEventSelect,
  initialDate,
  focusDateISO,
  selectedEventSlug,
}) {
  const seed = initialDate ? new Date(initialDate) : new Date(2026, 7, 1)
  const [cursor, setCursor] = useState({ year: seed.getFullYear(), month: seed.getMonth() })

  useEffect(() => {
    if (!focusDateISO) return
    const focus = new Date(focusDateISO)
    setCursor({ year: focus.getFullYear(), month: focus.getMonth() })
  }, [focusDateISO])

  const eventsByDate = useMemo(() => {
    const map = new Map()
    events.forEach((event) => {
      if (!event.dateISO) return
      const list = map.get(event.dateISO) ?? []
      list.push(event)
      map.set(event.dateISO, list)
    })
    return map
  }, [events])

  const nextEvent = useMemo(
    () => events.find((event) => event.status === 'inscripcion_abierta') ?? events[0],
    [events],
  )

  const cells = buildMonthGrid(cursor.year, cursor.month)

  function prevMonth() {
    setCursor((current) => {
      const month = current.month === 0 ? 11 : current.month - 1
      const year = current.month === 0 ? current.year - 1 : current.year
      return { year, month }
    })
  }

  function nextMonth() {
    setCursor((current) => {
      const month = current.month === 11 ? 0 : current.month + 1
      const year = current.month === 11 ? current.year + 1 : current.year
      return { year, month }
    })
  }

  const today = new Date()
  const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate())

  return (
    <div className="event-calendar surface-card surface-card--spotlight">
      <header className="event-calendar__header">
        <button type="button" className="event-calendar__nav" onClick={prevMonth} aria-label="Mes anterior">
          <ChevronLeft size={20} />
        </button>
        <h3 className="event-calendar__title">
          {MONTHS[cursor.month]} <span>{cursor.year}</span>
        </h3>
        <button type="button" className="event-calendar__nav" onClick={nextMonth} aria-label="Mes siguiente">
          <ChevronRight size={20} />
        </button>
      </header>

      <div className="event-calendar__weekdays">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="event-calendar__grid">
        {cells.map((day, index) => {
          if (!day) {
            return <div key={`empty-${index}`} className="event-calendar__cell event-calendar__cell--empty" />
          }

          const key = toKey(cursor.year, cursor.month, day)
          const dayEvents = eventsByDate.get(key) ?? []
          const hasEvent = dayEvents.length > 0
          const isToday = key === todayKey
          const isSelected = dayEvents.some((event) => event.slug === selectedEventSlug)

          return (
            <button
              key={key}
              type="button"
              className={[
                'event-calendar__cell',
                hasEvent ? 'event-calendar__cell--event' : '',
                isToday ? 'event-calendar__cell--today' : '',
                isSelected ? 'event-calendar__cell--selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => hasEvent && onEventSelect?.(dayEvents[0])}
              disabled={!hasEvent}
              title={hasEvent ? dayEvents.map((event) => event.title).join(', ') : undefined}
            >
              <span className="event-calendar__day">{day}</span>
              {hasEvent && (
                <>
                  <span className="event-calendar__event-label">{dayEvents[0].title.split(' ')[0]}</span>
                  <span className="event-calendar__dots" aria-hidden>
                    {dayEvents.map((event) => (
                      <span
                        key={event.slug}
                        className={`event-calendar__dot event-calendar__dot--${EVENT_STATUS[event.status]?.tone ?? 'neutral'}`}
                      />
                    ))}
                  </span>
                </>
              )}
            </button>
          )
        })}
      </div>

      <footer className="event-calendar__footer">
        <div className="event-calendar__legend">
          {Object.entries(EVENT_STATUS).slice(0, 4).map(([key, meta]) => (
            <span key={key} className="event-calendar__legend-item">
              <span className={`event-calendar__dot event-calendar__dot--${meta.tone}`} />
              {meta.label}
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
              <span className="event-calendar__jump-label">Próximo meet</span>
              <strong>{nextEvent.title}</strong>
            </span>
            <ArrowRight size={16} aria-hidden />
          </button>
        )}
      </footer>
    </div>
  )
}
