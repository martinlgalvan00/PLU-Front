import { useMemo, useState } from 'react'
import { ArrowRight, Download, FileStack, ShieldCheck, Trophy } from 'lucide-react'
import DesignPageHero from '../components/layout/DesignPageHero.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import ResultsArchiveList from '../components/ui/ResultsArchiveList.jsx'
import ResultsArchiveToolbar from '../components/ui/ResultsArchiveToolbar.jsx'
import {
  RESULTS_FILTER_LABELS,
  filterResultsArchive,
  getResultsArchive,
  getResultsSummary,
  sortResultsArchive,
} from '../services/resultsService.js'
import { UPCOMING_EVENTS } from '../lib/events.js'

const RESULTS_NOTES = [
  {
    icon: ShieldCheck,
    title: 'Normalización',
    text: 'Procesados por Maximal / PLU ARG — compatibles con LiftingCast y OpenPowerlifting.',
  },
  {
    icon: Download,
    title: 'Exportación',
    text: 'Consulta en pantalla y descarga CSV/XLSX por evento publicado.',
  },
  {
    icon: Trophy,
    title: 'PLU USA',
    text: 'Archivo oficial disponible para auditoría y exportación consolidada.',
  },
]

function ResultsHeroPanel({ pending, published }) {
  return (
    <div className="results-hero-panel">
      <div className="results-hero-panel__stats" aria-label="Resumen del archivo">
        <article className="results-hero-panel__stat">
          <span className="results-hero-panel__icon" aria-hidden>
            <Trophy size={14} />
          </span>
          <div className="results-hero-panel__copy">
            <strong>{published}</strong>
            <span>Publicados</span>
          </div>
        </article>
        <article className="results-hero-panel__stat results-hero-panel__stat--pending">
          <span className="results-hero-panel__icon" aria-hidden>
            <FileStack size={14} />
          </span>
          <div className="results-hero-panel__copy">
            <strong>{pending}</strong>
            <span>En espera</span>
          </div>
        </article>
      </div>
      <p className="results-hero-panel__hint">
        Resultados oficiales por evento · exportación CSV/XLSX disponible al publicar.
      </p>
    </div>
  )
}

export default function ResultsPage({ onNavigate, events = UPCOMING_EVENTS }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('recent')

  const nextEvent = useMemo(() => events.find((event) => event.featured) ?? events[0], [events])
  const archive = useMemo(() => getResultsArchive(events), [events])
  const summary = useMemo(() => getResultsSummary(archive), [archive])

  const filteredEvents = useMemo(() => {
    const filtered = filterResultsArchive(archive, { query, filter })
    return sortResultsArchive(filtered, sort)
  }, [archive, filter, query, sort])

  const showPublishedEmpty = summary.published === 0 && (filter === 'all' || filter === 'published')

  return (
    <main className="page page--design results-page--design results-page--premium">
      <DesignPageHero
        compact
        breadcrumbLabel="Resultados"
        onHome={() => onNavigate?.('home')}
        eyebrow="Archivo oficial"
        title="Resultados oficiales"
        description="Historial por evento con búsqueda, filtros y exportación."
      >
        <ResultsHeroPanel pending={summary.pending} published={summary.published} />
      </DesignPageHero>

      <div className="results-page__inner">
        <Reveal>
          <section className="results-shell" aria-label="Archivo de resultados por evento">
            <header className="results-shell__head">
              <div className="results-shell__head-copy">
                <span className="results-shell__eyebrow">Historial</span>
                <h2 className="results-shell__title">Eventos del archivo</h2>
                <p className="results-shell__lead">
                  {summary.published} publicados · {summary.pending} en espera de carga
                </p>
              </div>
            </header>

            <ResultsArchiveToolbar
              embedded
              count={filteredEvents.length}
              filter={filter}
              filterLabel={RESULTS_FILTER_LABELS[filter]}
              query={query}
              sort={sort}
              onFilterChange={setFilter}
              onQueryChange={setQuery}
              onSortChange={setSort}
            />

            <ResultsArchiveList entries={filteredEvents} onNavigate={onNavigate} />
          </section>
        </Reveal>

        {showPublishedEmpty && (
          <Reveal delay={60}>
            <div className="results-empty results-empty--premium">
              <span className="results-empty__icon" aria-hidden>
                <Trophy size={22} strokeWidth={1.75} />
              </span>
              <p className="results-empty__title">Todavía no hay resultados publicados</p>
              <p className="results-empty__desc">
                En cuanto termine {nextEvent?.title ?? 'el próximo evento'}, los resultados se
                publican acá por categoría, división y peso corporal.
              </p>
              <button
                type="button"
                className="results-empty__link"
                onClick={() => onNavigate?.('pitbull')}
              >
                Ver {nextEvent?.title ?? 'el evento'}
                <ArrowRight size={14} aria-hidden />
              </button>
            </div>
          </Reveal>
        )}
      </div>

      <section className="results-footnotes" aria-label="Información del archivo">
        <div className="results-footnotes__inner">
          {RESULTS_NOTES.map(({ icon: Icon, title, text }) => (
            <Reveal key={title}>
              <article className="results-footnotes__item">
                <span className="results-footnotes__icon" aria-hidden>
                  <Icon size={16} strokeWidth={1.75} />
                </span>
                <div className="results-footnotes__copy">
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>
    </main>
  )
}
