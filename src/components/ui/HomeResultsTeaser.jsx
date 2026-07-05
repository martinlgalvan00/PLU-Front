import { ArrowRight } from 'lucide-react'
import { HOME_RESULTS } from '../../lib/content.js'

export default function HomeResultsTeaser({ onNavigate }) {
  return (
    <article className="home-teaser-card home-teaser-card--results">
      <span className="home-teaser-card__eyebrow">{HOME_RESULTS.eyebrow}</span>
      <h2 className="home-teaser-card__title">{HOME_RESULTS.title}</h2>
      <p className="home-teaser-card__desc">{HOME_RESULTS.description}</p>
      <button type="button" className="home-teaser-card__link" onClick={() => onNavigate('results')}>
        Ver resultados
        <ArrowRight size={14} aria-hidden />
      </button>
    </article>
  )
}
