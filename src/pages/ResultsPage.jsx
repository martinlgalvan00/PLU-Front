import { Circle } from 'lucide-react'
import { UPCOMING_EVENTS } from '../lib/events.js'
import DesignPageHero from '../components/layout/DesignPageHero.jsx'
import Reveal from '../components/ui/Reveal.jsx'

const NEXT_EVENT = UPCOMING_EVENTS.find((event) => event.featured) ?? UPCOMING_EVENTS[0]

export default function ResultsPage({ onNavigate }) {
  return (
    <main className="page page--design results-page--design">
      <DesignPageHero
        breadcrumbLabel="Resultados"
        onHome={() => onNavigate?.('home')}
        title="Resultados oficiales"
        description="Resultados normalizados y disponibles para consulta pública apenas se cierra cada evento."
      />

      <div className="results-page__inner">
        <Reveal>
          <div className="results-status-table" role="table" aria-label="Estado de eventos">
            <div className="results-status-table__head" role="row">
              <span role="columnheader">Evento</span>
              <span role="columnheader">Fecha</span>
              <span role="columnheader">Estado</span>
              <span role="columnheader" className="results-status-table__action-head">
                Acción
              </span>
            </div>
            {NEXT_EVENT && (
              <div className="results-status-table__row" role="row">
                <span className="results-status-table__event" role="cell">
                  {NEXT_EVENT.title}
                </span>
                <span className="results-status-table__date" role="cell">
                  {NEXT_EVENT.date} {NEXT_EVENT.dateISO?.slice(0, 4)}{' '}
                  <span className="results-status-table__date-note">(ejemplo)</span>
                </span>
                <span role="cell">
                  <span className="status-pill status-pill--pending">Pendiente</span>
                </span>
                <span className="results-status-table__action" role="cell">
                  Después del evento
                </span>
              </div>
            )}
          </div>
        </Reveal>
      </div>

      <div className="results-page__inner">
        <Reveal>
          <div className="results-empty results-empty--dashed">
            <span className="results-empty__icon" aria-hidden>
              <Circle size={16} strokeWidth={2.5} />
            </span>
            <p className="results-empty__title">Todavía no hay resultados publicados</p>
            <p className="results-empty__desc">
              En cuanto termine {NEXT_EVENT?.title ?? 'el próximo evento'}, los resultados se
              normalizan y se publican acá — por categoría, división y peso corporal.
            </p>
            <button type="button" className="results-empty__link" onClick={() => onNavigate?.('pitbull')}>
              Ver {NEXT_EVENT?.title ?? 'el evento'} →
            </button>
          </div>
        </Reveal>
      </div>

      <section className="results-info">
        <div className="results-info__grid">
          <Reveal>
            <div className="results-info__col">
              <span className="results-info__eyebrow">Cómo se procesan</span>
              <p>
                Se cargan y normalizan por el equipo de Maximal / PLU ARG antes de publicarse —
                compatibles con formatos de LiftingCast y OpenPowerlifting.
              </p>
            </div>
          </Reveal>
          <Reveal delay={60}>
            <div className="results-info__col">
              <span className="results-info__eyebrow">Descarga</span>
              <p>
                Cada evento con resultados publicados permite consulta en pantalla y descarga en
                CSV/XLSX.
              </p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="results-info__col">
              <span className="results-info__eyebrow">Reconocimiento</span>
              <p>
                Todos los resultados oficiales quedan disponibles para auditoría y exportación
                consolidada de PLU USA.
              </p>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  )
}
