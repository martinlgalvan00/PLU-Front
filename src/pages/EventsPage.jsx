import { useMemo, useState } from 'react'
import PageHero from '../components/layout/PageHero.jsx'
import Button from '../components/ui/Button.jsx'
import EventCalendar from '../components/ui/EventCalendar.jsx'
import EventCard from '../components/ui/EventCard.jsx'
import StatusPill from '../components/ui/StatusPill.jsx'
import { UPCOMING_EVENTS } from '../lib/events.js'

const FILTERS = [
  ['all', 'Todos'],
  ['open', 'Inscripción abierta'],
  ['soon', 'Próximamente'],
]

export default function EventsPage({ onNavigate, onSelectEvent }) {
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('all')
  const [calendarFocus, setCalendarFocus] = useState('2026-08-01')

  const stats = useMemo(() => {
    const openCount = UPCOMING_EVENTS.filter((event) => event.status === 'inscripcion_abierta').length
    return {
      total: UPCOMING_EVENTS.length,
      open: openCount,
      next: UPCOMING_EVENTS[0],
    }
  }, [])

  const filteredEvents = useMemo(() => {
    return UPCOMING_EVENTS.filter((event) => {
      if (filter === 'open') return event.status === 'inscripcion_abierta'
      if (filter === 'soon') return event.status === 'proximamente'
      return true
    })
  }, [filter])

  function focusEvent(event) {
    setSelected(event)
    setCalendarFocus(event.dateISO)
    requestAnimationFrame(() => {
      document.getElementById(`event-${event.slug}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  return (
    <main className="page events-page">
      <PageHero
        eyebrow="Eventos"
        title="Calendario competitivo 2026"
        description="Meet oficiales PLU ARG en distintas provincias. Explorá el calendario y elegí tu próxima competencia."
      />

      <section className="events-page__stats" aria-label="Resumen del calendario">
        <div className="events-stat">
          <strong>{stats.total}</strong>
          <span>Meets programados</span>
        </div>
        <div className="events-stat events-stat--open">
          <strong>{stats.open}</strong>
          <span>Con inscripción abierta</span>
        </div>
        <div className="events-stat events-stat--next">
          <strong>{stats.next.date}</strong>
          <span>Próximo: {stats.next.title}</span>
        </div>
      </section>

      <section className="page-section events-page__main">
        <div className="page-section__inner">
          <div className="events-layout">
            <aside className="events-layout__calendar">
              <EventCalendar
                events={UPCOMING_EVENTS}
                initialDate="2026-08-01"
                focusDateISO={calendarFocus}
                selectedEventSlug={selected?.slug}
                onEventSelect={focusEvent}
              />
            </aside>

            <div className="events-layout__list">
              <header className="events-list__header">
                <div>
                  <h2>Próximos meets</h2>
                  <p>Seleccioná un evento en el calendario o desde la lista.</p>
                </div>
                <div className="events-list__filters" role="tablist" aria-label="Filtrar eventos">
                  {FILTERS.map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={filter === key}
                      className={filter === key ? 'is-active' : ''}
                      onClick={() => setFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </header>

              {selected && (
                <article className="events-selected surface-card">
                  <div className="events-selected__copy">
                    <span>Evento seleccionado</span>
                    <strong>{selected.title}</strong>
                    <p>
                      {selected.date} · {selected.venue}, {selected.location}
                    </p>
                  </div>
                  <div className="events-selected__meta">
                    <StatusPill value={selected.status} />
                    <div className="events-selected__actions">
                      <Button className="btn--small" onClick={() => onSelectEvent(selected)}>
                        Inscribirme
                      </Button>
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => setSelected(null)}>
                        Limpiar
                      </button>
                    </div>
                  </div>
                </article>
              )}

              <div className="events-grid events-grid--stacked">
                {filteredEvents.map((event, index) => (
                  <div key={event.slug} id={`event-${event.slug}`}>
                    <EventCard
                      featured={index === 0 && filter === 'all'}
                      selected={selected?.slug === event.slug}
                      date={event.date}
                      title={event.title}
                      venue={event.venue}
                      location={event.location}
                      status={event.status}
                      onAction={() => onSelectEvent(event)}
                      onSelect={() => focusEvent(event)}
                    />
                  </div>
                ))}
              </div>

              {filteredEvents.length === 0 && (
                <p className="events-list__empty">No hay eventos con este filtro por ahora.</p>
              )}

              <div className="page-section__action page-section__action--left">
                <Button variant="outline" onClick={() => onNavigate('register')}>
                  Inscribirme a un evento
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
