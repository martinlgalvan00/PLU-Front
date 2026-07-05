import { ArrowRight } from 'lucide-react'
import { HOME_RULEBOOK } from '../../lib/content.js'

export default function HomeRulebookTeaser({ onNavigate }) {
  return (
    <article className="home-teaser-card home-teaser-card--rulebook">
      <span className="home-teaser-card__eyebrow">{HOME_RULEBOOK.eyebrow}</span>
      <h2 className="home-teaser-card__title">{HOME_RULEBOOK.title}</h2>
      <button type="button" className="home-teaser-card__link" onClick={() => onNavigate('rulebook')}>
        {HOME_RULEBOOK.cta}
        <ArrowRight size={14} aria-hidden />
      </button>
    </article>
  )
}
