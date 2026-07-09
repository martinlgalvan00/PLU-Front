import { ArrowRight, Users } from 'lucide-react'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function CommunitySpotlight({ onNavigate }) {
  const { HOME_COMMUNITY } = useContent()
  const { t } = useI18n()

  return (
    <article className="community-spotlight">
      <div className="community-spotlight__panel">
        <header className="community-spotlight__head">
          <span className="community-spotlight__icon" aria-hidden>
            <Users size={16} strokeWidth={1.75} />
          </span>
          <span className="community-spotlight__eyebrow">{HOME_COMMUNITY.eyebrow}</span>
        </header>

        <div className="community-spotlight__body">
          <h2 className="community-spotlight__title">{HOME_COMMUNITY.title}</h2>
          <p className="community-spotlight__desc">{HOME_COMMUNITY.description}</p>
        </div>

        {HOME_COMMUNITY.stats.length > 0 ? (
          <ul className="community-spotlight__stats">
            {HOME_COMMUNITY.stats.map(({ value, label }) => (
              <li key={label} className="community-spotlight__stat">
                <strong>{value}</strong>
                <span>{label}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <footer className="community-spotlight__foot">
          <button
            type="button"
            className="community-spotlight__cta"
            onClick={() => onNavigate('community')}
          >
            {HOME_COMMUNITY.cta}
            <ArrowRight size={14} aria-hidden />
          </button>
        </footer>
      </div>

      <aside className="community-spotlight__aside" aria-hidden>
        <div className="community-spotlight__aside-inner">
          <span className="community-spotlight__aside-badge">{t('pages.home.communityBadge')}</span>
          <Users className="community-spotlight__aside-icon" size={28} strokeWidth={1.35} />
          <p className="community-spotlight__aside-caption">{HOME_COMMUNITY.visualCaption}</p>
        </div>
      </aside>
    </article>
  )
}
