import { ArrowRight, BookOpen } from 'lucide-react'
import { useContent } from '../../hooks/useContent.js'

export default function HomeRulebookTeaser({ onNavigate }) {
  const { HOME_RULEBOOK } = useContent()

  return (
    <article className="home-teaser-card home-teaser-card--rulebook">
      <div className="home-teaser-card__head">
        <span className="home-teaser-card__icon home-teaser-card__icon--red" aria-hidden>
          <BookOpen size={16} strokeWidth={1.75} />
        </span>
        <span className="home-teaser-card__eyebrow">{HOME_RULEBOOK.eyebrow}</span>
      </div>

      <div className="home-teaser-card__body">
        <h2 className="home-teaser-card__title">{HOME_RULEBOOK.title}</h2>
      </div>

      <button type="button" className="home-teaser-card__link" onClick={() => onNavigate('rulebook')}>
        {HOME_RULEBOOK.cta}
        <ArrowRight size={14} aria-hidden />
      </button>
    </article>
  )
}
