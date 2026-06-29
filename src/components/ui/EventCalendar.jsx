import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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

export default function EventCalendar({ events = [], onEventSelect, initialDate }) {
  const seed = initialDate ? new Date(initialDate) : new Date(2026, 7, 1)
  const [cursor, setCursor] = useState({ year: seed.getFullYear(), month: seed.getMonth() })

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

  const cells = buildMonthGrid(cursor.year, cursor.month)

  function prevMonth() {
    setCursor((c) => {
      const month = c.month === 0 ? 11 : c.month - 1
      const year = c.month === 0 ? c.year - 1 : c.year
      return { year, month }
    })
  }

  function nextMonth() {
    setCursor((c) => {
      const month = c.month === 11 ? 0 : c.month + 1
      const year = c.month === 11 ? c.year + 1 : c.year
      return { year, month }
    })
  }

  const today = new Date()
  const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate())

  return (
    <div className="event-calendar surface-card">
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
          if (!day) return <div key={`empty-${index}`} className="event-calendar__cell event-calendar__cell--empty" />

          const key = toKey(cursor.year, cursor.month, day)
          const dayEvents = eventsByDate.get(key) ?? []
          const hasEvent = dayEvents.length > 0
          const isToday = key === todayKey

          return (
            <button
              key={key}
              type="button"
              className={[
                'event-calendar__cell',
                hasEvent ? 'event-calendar__cell--event' : '',
                isToday ? 'event-calendar__cell--today' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => hasEvent && onEventSelect?.(dayEvents[0])}
              disabled={!hasEvent}
            >
              <span className="event-calendar__day">{day}</span>
              {hasEvent && (
                <span className="event-calendar__dots" aria-hidden>
                  {dayEvents.map((ev) => (
                    <span key={ev.slug} className={`event-calendar__dot event-calendar__dot--${EVENT_STATUS[ev.status]?.tone ?? 'neutral'}`} />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <footer className="event-calendar__legend">
        {Object.entries(EVENT_STATUS).slice(0, 4).map(([key, meta]) => (
          <span key={key} className="event-calendar__legend-item">
            <span className={`event-calendar__dot event-calendar__dot--${meta.tone}`} />
            {meta.label}
          </span>
        ))}
      </footer>
    </div>
  )
}
