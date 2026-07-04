import { HOME_COMMUNITY } from '../../lib/content.js'

export default function CommunitySpotlight({ onNavigate }) {
  return (
    <div className="community-spotlight">
      <div className="community-spotlight__glow" aria-hidden />
      <div className="community-spotlight__inner">
        <p className="community-spotlight__photo-label">foto — comunidad, gimnasio, magnesio en tarima</p>
        <span className="community-spotlight__eyebrow">{HOME_COMMUNITY.eyebrow}</span>
        <h2 className="community-spotlight__title">{HOME_COMMUNITY.title}</h2>
        <p className="community-spotlight__desc">{HOME_COMMUNITY.description}</p>
        <button type="button" className="community-spotlight__link" onClick={() => onNavigate('community')}>
          {HOME_COMMUNITY.cta} →
        </button>
      </div>
    </div>
  )
}
