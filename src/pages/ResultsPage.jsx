import { useState, useMemo } from 'react'
import { Trophy } from 'lucide-react'
import { RECENT_RESULTS } from '../lib/content.js'
import DesignPageHero from '../components/layout/DesignPageHero.jsx'
import Podium from '../components/ui/Podium.jsx'
import ResultCard from '../components/ui/ResultCard.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import StaggerReveal from '../components/ui/StaggerReveal.jsx'
import FilterPills from '../components/ui/FilterPills.jsx'

// Extraer eventos únicos para el filtro
const EVENTS_LIST = ['all', ...Array.from(new Set(RECENT_RESULTS.map((r) => r.event)))]
const EVENT_LABELS = { all: 'Todos los meets' }

// Top 3 para el podio (buscamos 1°, 2°, 3° en el place)
const PODIUM_RESULTS = RECENT_RESULTS.filter((r) =>
  ['1°', '2°', '3°'].some((rank) => r.place?.startsWith(rank))
).slice(0, 3)

function ResultsStats({ results }) {
  const total = results.length
  const events = new Set(results.map((r) => r.event)).size

  return (
    <div className="results-stats" aria-label="Estadísticas de resultados">
      <div className="results-stat">
        <strong>{total}</strong>
        <span>Resultados registrados</span>
      </div>
      <div className="results-stat">
        <strong>{events}</strong>
        <span>Meets publicados</span>
      </div>
    </div>
  )
}

export default function ResultsPage({ onNavigate }) {
  const [eventFilter, setEventFilter] = useState('all')

  const filtered = useMemo(() => {
    if (eventFilter === 'all') return RECENT_RESULTS
    return RECENT_RESULTS.filter((r) => r.event === eventFilter)
  }, [eventFilter])

  const filterOptions = EVENTS_LIST.map((ev) => [ev, EVENT_LABELS[ev] ?? ev])

  return (
    <main className="page page--design results-page--design">
      <DesignPageHero
        breadcrumbLabel="Resultados"
        onHome={() => onNavigate?.('home')}
        eyebrow="Competencia oficial PLU ARG"
        title="Planillas de resultados"
        description="Totales validados, categorías y posiciones de meets oficiales."
      />

      <Reveal>
        <div className="results-page__inner">
          <ResultsStats results={RECENT_RESULTS} />
        </div>
      </Reveal>

      {/* ── Podio animado ───────────────────── */}
      {PODIUM_RESULTS.length > 0 && (
        <section className="results-podium">
          <header className="results-podium__header">
            <span className="results-podium__eyebrow">Destacados de la temporada</span>
            <h2 className="results-podium__title">Podio</h2>
          </header>

          <Podium results={PODIUM_RESULTS} />
        </section>
      )}

      {/* ── Lista de resultados ─────────────── */}
      <div className="results-page__inner">
        <Reveal>
          <header className="results-list-header">
            <div>
              <span className="results-list-header__eyebrow">Todos los resultados</span>
              <h2 className="results-list-header__title">Planillas oficiales</h2>
            </div>

            <div className="results-list-header__filters">
              <FilterPills
                active={eventFilter}
                ariaLabel="Filtrar por evento"
                onChange={setEventFilter}
                options={filterOptions}
              />
              <p className="results-count" aria-live="polite">
                {filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}
              </p>
            </div>
          </header>
        </Reveal>

        {filtered.length > 0 ? (
          <StaggerReveal className="results-grid" stagger={80}>
            {filtered.map((result, i) => (
              <ResultCard
                key={`${result.athlete}-${result.date}`}
                {...result}
                featured={i === 0 && eventFilter === 'all'}
              />
            ))}
          </StaggerReveal>
        ) : (
          <Reveal>
            <div className="results-empty">
              <Trophy size={32} strokeWidth={1.5} aria-hidden />
              <p>No hay resultados para este evento todavía.</p>
            </div>
          </Reveal>
        )}
      </div>
    </main>
  )
}
