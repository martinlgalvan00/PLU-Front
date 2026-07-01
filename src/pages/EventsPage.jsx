import { useState } from 'react'
import PageHero from '../components/layout/PageHero.jsx'
import Button from '../components/ui/Button.jsx'
import EventCalendar from '../components/ui/EventCalendar.jsx'
import EventCard from '../components/ui/EventCard.jsx'
import { UPCOMING_EVENTS } from '../lib/events.js'

export default function EventsPage({ onSelectEvent }) {
  const [selected, setSelected] = useState(null)

  return (
    <main className="page events-page">
      <PageHero
        eyebrow="Eventos"
        title="Calendario competitivo 2026"
        description="Meet oficiales PLU ARG en distintas provincias."
      />

      <section className="page-section">
        <div className="page-section__inner">
          <div className="events-layout">
            <div className="events-layout__calendar">
              <EventCalendar
                events={UPCOMING_EVENTS}
                initialDate="2026-08-01"
                onEventSelect={(event) => setSelected(event)}
              />
            </div>

            <div className="events-layout__list">
              {selected && (
                <p className="events-layout__selected">
                  Seleccionado: <strong>{selected.title}</strong> — {selected.date}
                </p>
              )}
              <div className="events-grid events-grid--stacked">
                {UPCOMING_EVENTS.map((event, i) => (
                  <EventCard
                    key={event.slug}
                    featured={i === 0}
                    date={event.date}
                    title={event.title}
                    venue={event.venue}
                    location={event.location}
                    status={event.status}
                    onAction={() => onSelectEvent(event)}
                  />
                ))}
              </div>
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
