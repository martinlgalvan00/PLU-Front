import { useEffect, useMemo, useState } from 'react'

import { CalendarDays, MapPin, ArrowRight } from 'lucide-react'

import DesignPageHero from '../components/layout/DesignPageHero.jsx'

import FilterPills from '../components/ui/FilterPills.jsx'

import Button from '../components/ui/Button.jsx'

import EventCalendar from '../components/ui/EventCalendar.jsx'

import EventCard from '../components/ui/EventCard.jsx'

import PitbullSpotlight from '../components/ui/PitbullSpotlight.jsx'

import Reveal from '../components/ui/Reveal.jsx'

import StaggerReveal from '../components/ui/StaggerReveal.jsx'

import StatusPill from '../components/ui/StatusPill.jsx'

import { UPCOMING_EVENTS } from '../lib/events.js'

import { getStatusMeta } from '../lib/status.js'



const FILTERS = [

  ['all', 'Todos'],

  ['open', 'Inscripción abierta'],

  ['soon', 'Próximamente'],

  ['done', 'Finalizados'],

]



const FILTER_LABELS = {

  all: 'eventos activos',

  open: 'con inscripción abierta',

  soon: 'próximamente',

  done: 'finalizados',

}



function EventsStats({ stats }) {

  return (

    <section className="events-page__stats events-page__stats--design" aria-label="Resumen de eventos">

      <article className="events-stat events-stat--design">

        <strong>{stats.upcoming}</strong>

        <span>Próximos meets</span>

      </article>

      <article className="events-stat events-stat--design events-stat--open">

        <strong>{stats.open}</strong>

        <span>Inscripción abierta</span>

      </article>

      <article className="events-stat events-stat--design events-stat--next">

        <strong>{stats.nextLabel}</strong>

        <span>Siguiente en calendario</span>

      </article>

    </section>

  )

}



function EventsDetailPanel({ event, onRegister, onViewPitbull }) {

  if (!event) {

    return (

      <div className="events-detail events-detail--empty">

        <CalendarDays size={28} strokeWidth={1.5} aria-hidden />

        <p>Seleccioná un evento de la lista o del calendario para ver el detalle.</p>

      </div>

    )

  }



  const { label: statusLabel } = getStatusMeta(event.status)

  const isPitbull = event.featured

  const canRegister = event.status === 'inscripcion_abierta' || event.status === 'cupos_limitados'



  return (

    <div className="events-detail">

      <span className="events-detail__eyebrow">Evento seleccionado</span>

      <h3 className="events-detail__title">{event.title}</h3>

      <StatusPill value={event.status} />

      <ul className="events-detail__meta">

        <li>

          <CalendarDays size={14} aria-hidden />

          {event.date}

        </li>

        <li>

          <MapPin size={14} aria-hidden />

          {event.venue}, {event.location}

        </li>

      </ul>

      <p className="events-detail__status-copy">{statusLabel}</p>

      <div className="events-detail__actions">

        {canRegister && onRegister && (

          <Button className="btn--small" onClick={onRegister}>

            Inscribirme

            <ArrowRight size={14} aria-hidden />

          </Button>

        )}

        {isPitbull && onViewPitbull && (

          <Button variant="outline" className="btn--small" onClick={onViewPitbull}>

            Ver ficha completa

          </Button>

        )}

      </div>

    </div>

  )

}



export default function EventsPage({ onNavigate, onSelectEvent }) {

  const pitbull = UPCOMING_EVENTS.find((event) => event.featured) ?? UPCOMING_EVENTS[0]

  const [selected, setSelected] = useState(pitbull)

  const [filter, setFilter] = useState('all')

  const [calendarFocus, setCalendarFocus] = useState(pitbull?.dateISO ?? '2026-12-01')



  const stats = useMemo(() => {

    const upcoming = UPCOMING_EVENTS.filter((event) => event.status !== 'finalizado')

    const open = UPCOMING_EVENTS.filter(

      (event) => event.status === 'inscripcion_abierta' || event.status === 'cupos_limitados',

    )

    const next = [...upcoming].sort((a, b) => a.dateISO.localeCompare(b.dateISO))[0]



    return {

      upcoming: upcoming.length,

      open: open.length,

      nextLabel: next?.date?.replace(/\s.*/, '') ?? '—',

    }

  }, [])



  const filteredEvents = useMemo(() => {

    return UPCOMING_EVENTS.filter((event) => {

      if (filter === 'open') {

        return event.status === 'inscripcion_abierta' || event.status === 'cupos_limitados'

      }

      if (filter === 'soon') return event.status === 'proximamente'

      if (filter === 'done') return event.status === 'finalizado'

      return event.status !== 'finalizado'

    })

  }, [filter])



  const showPitbull = (filter === 'all' || filter === 'soon') && pitbull?.status !== 'finalizado'



  const listEvents = useMemo(() => {

    if (filter === 'done') return filteredEvents

    return filteredEvents.filter((event) => !event.featured || !showPitbull)

  }, [filter, filteredEvents, showPitbull])



  useEffect(() => {

    if (listEvents.length === 0) {

      setSelected(null)

      return

    }



    const stillVisible = listEvents.some((event) => event.slug === selected?.slug)

    if (!stillVisible) {

      const next = listEvents[0]

      setSelected(next)

      setCalendarFocus(next.dateISO)

    }

  }, [listEvents, selected?.slug])



  function focusEvent(event) {

    setSelected(event)

    setCalendarFocus(event.dateISO)

  }



  function handleRegister(event) {

    onSelectEvent?.(event)

  }



  return (

    <main className="page page--design events-page--design">

      <DesignPageHero

        breadcrumbLabel="Eventos"

        onHome={() => onNavigate('home')}

        eyebrow="Temporada 2026"

        title="Calendario de eventos"

        description="Todos los eventos oficiales de PLU ARG, con su estado de inscripción actualizado."

      />



      <Reveal>

        <EventsStats stats={stats} />

      </Reveal>



      <Reveal>

        <div className="events-toolbar">

          <div className="events-toolbar__row">

            <FilterPills

              active={filter}

              ariaLabel="Filtrar eventos"

              onChange={setFilter}

              options={FILTERS}

            />

            <p className="events-toolbar__count" aria-live="polite">

              {listEvents.length} {listEvents.length === 1 ? 'evento' : 'eventos'}{' '}

              {FILTER_LABELS[filter]}

            </p>

          </div>

        </div>

      </Reveal>



      <div className="events-layout-v2">

        <div className="events-main-column">

          {showPitbull && pitbull && (

            <Reveal variant="from-left">

              <PitbullSpotlight

                onDetail={() => onNavigate('pitbull')}

                onRegister={

                  pitbull.status === 'inscripcion_abierta' || pitbull.status === 'cupos_limitados'

                    ? () => handleRegister(pitbull)

                    : undefined

                }

              />

            </Reveal>

          )}



          <header className={`events-list-header ${showPitbull ? 'events-list-header--spaced' : ''}`}>

            <div>

              <span className="events-list-header__eyebrow">Agenda PLU ARG</span>

              <h2 className="events-list-header__title">

                {filter === 'done' ? 'Eventos finalizados' : 'Próximos meets'}

              </h2>

            </div>

          </header>



          {listEvents.length > 0 ? (

            <StaggerReveal className="events-list events-list--design" stagger={70}>

              {listEvents.map((event) => (

                <EventCard

                  key={event.slug}

                  date={event.date}

                  title={event.title}

                  venue={event.venue}

                  location={event.location}

                  status={event.status}

                  selected={selected?.slug === event.slug}

                  onSelect={() => focusEvent(event)}

                  onAction={

                    event.status === 'inscripcion_abierta' || event.status === 'cupos_limitados'

                      ? () => handleRegister(event)

                      : () => focusEvent(event)

                  }

                  actionLabel="Inscribirme"

                />

              ))}

            </StaggerReveal>

          ) : (

            <div className="events-list__empty">

              <CalendarDays size={32} strokeWidth={1.5} aria-hidden />

              <p>No hay eventos {FILTER_LABELS[filter]} en este momento.</p>

              <Button variant="outline" className="btn--small" onClick={() => setFilter('all')}>

                Ver todos los eventos

              </Button>

            </div>

          )}

        </div>



        <Reveal variant="from-right" as="aside" className="events-sidebar-card">

          <EventCalendar

            events={UPCOMING_EVENTS}

            initialDate="2026-12-01"

            focusDateISO={calendarFocus}

            selectedEventSlug={selected?.slug}

            onEventSelect={focusEvent}

          />

          <EventsDetailPanel

            event={selected}

            onRegister={selected ? () => handleRegister(selected) : undefined}

            onViewPitbull={selected?.featured ? () => onNavigate('pitbull') : undefined}

          />

        </Reveal>

      </div>

    </main>

  )

}


