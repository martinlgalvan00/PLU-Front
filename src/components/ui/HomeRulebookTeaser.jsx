import { HOME_RULEBOOK } from '../../lib/content.js'

export default function HomeRulebookTeaser({ onNavigate }) {
  return (
    <div className="rulebook-teaser">
      <div className="rulebook-teaser__copy">
        <span className="rulebook-teaser__eyebrow">{HOME_RULEBOOK.eyebrow}</span>
        <h2 className="rulebook-teaser__title">{HOME_RULEBOOK.title}</h2>
      </div>
      <div className="rulebook-teaser__action">
        <button type="button" className="rulebook-teaser__btn" onClick={() => onNavigate('rulebook')}>
          {HOME_RULEBOOK.cta}
        </button>
      </div>
    </div>
  )
}
