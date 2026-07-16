import { ArrowRight } from 'lucide-react'
import { useContent } from '../../hooks/useContent.js'

export default function HomeRulebookTeaser({ onNavigate }) {
  const { HOME_RULEBOOK } = useContent()

  return (
    <article className="home-teaser-card home-teaser-card--rulebook">
      <p className="home-teaser-card__eyebrow">{HOME_RULEBOOK.eyebrow}</p>

      <div className="home-teaser-card__body">
        <h2 className="home-teaser-card__title">{HOME_RULEBOOK.title}</h2>
      </div>

      <button type="button" className="home-teaser-card__link" onClick={() => onNavigate('rulebook')}>
        {HOME_RULEBOOK.cta}
        <ArrowRight size={14} aria-hidden className="home-teaser-card__link-icon" />
      </button>
    </article>
  )
}
