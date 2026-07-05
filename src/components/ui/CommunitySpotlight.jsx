import { ArrowRight } from 'lucide-react'
import { HOME_COMMUNITY } from '../../lib/content.js'

export default function CommunitySpotlight({ onNavigate }) {
  return (
    <article className="community-spotlight">
      <div className="community-spotlight__grid">
        <div className="community-spotlight__copy">
          <span className="community-spotlight__eyebrow">{HOME_COMMUNITY.eyebrow}</span>
          <h2 className="community-spotlight__title">{HOME_COMMUNITY.title}</h2>
          <p className="community-spotlight__desc">{HOME_COMMUNITY.description}</p>

          <ul className="community-spotlight__stats">
            {HOME_COMMUNITY.stats.map(({ value, label }) => (
              <li key={label} className="community-spotlight__stat">
                <strong>{value}</strong>
                <span>{label}</span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="community-spotlight__cta"
            onClick={() => onNavigate('community')}
          >
            {HOME_COMMUNITY.cta}
            <ArrowRight size={15} aria-hidden />
          </button>
        </div>

        <div className="community-spotlight__visual" aria-hidden>
          <div className="community-spotlight__visual-overlay" />
          <span className="community-spotlight__visual-badge">Red PLU ARG</span>
          <span className="community-spotlight__visual-caption">{HOME_COMMUNITY.visualCaption}</span>
        </div>
      </div>
    </article>
  )
}
