import { RECENT_RESULTS } from '../lib/content.js'
import PageHero from '../components/layout/PageHero.jsx'
import ResultCard from '../components/ui/ResultCard.jsx'
import Reveal from '../components/ui/Reveal.jsx'

export default function ResultsPage() {
  return (
    <main className="page">
      <div className="page__inner">
        <PageHero
          eyebrow="Resultados"
          title="Planillas oficiales PLU ARG"
          description="Totales validados, categorías y posiciones de meets recientes."
        />
        <div className="results-grid">
          {RECENT_RESULTS.map((result, i) => (
            <Reveal key={`${result.athlete}-${result.date}`} delay={i * 80}>
              <ResultCard {...result} />
            </Reveal>
          ))}
        </div>
      </div>
    </main>
  )
}
