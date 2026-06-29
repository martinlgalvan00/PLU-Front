import { useState } from 'react'
import PageHero from '../components/layout/PageHero.jsx'
import EventCalendar from '../components/ui/EventCalendar.jsx'
import EventCard from '../components/ui/EventCard.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import { UPCOMING_EVENTS } from '../lib/events.js'

export default function EventsPage({ onNavigate }) {
  const [selected, setSelected] = useState(null)

  return (
    <main className="page">
      <div className="page__inner">
        <PageHero
          eyebrow="Eventos"
          title="Calendario competitivo 2026"
          description="Meet oficiales PLU ARG en distintas provincias."
        />

        <div className="events-layout">
          <Reveal className="events-layout__calendar">
            <EventCalendar
              events={UPCOMING_EVENTS}
              initialDate="2026-08-01"
              onEventSelect={(event) => setSelected(event)}
            />
          </Reveal>

          <div className="events-layout__list">
            {selected && (
              <Reveal>
                <p className="events-layout__selected">
                  Seleccionado: <strong>{selected.title}</strong> — {selected.date}
                </p>
              </Reveal>
            )}
            <div className="events-grid events-grid--stacked">
              {UPCOMING_EVENTS.map((event, i) => (
                <Reveal key={event.slug} delay={i * 90}>
                  <EventCard
                    featured={i === 0}
                    date={event.date}
                    title={event.title}
                    venue={event.venue}
                    location={event.location}
                    status={event.status}
                    onAction={() => onNavigate('register')}
                  />
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
