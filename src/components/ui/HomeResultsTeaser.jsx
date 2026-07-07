import { ArrowRight, Trophy } from 'lucide-react'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function HomeResultsTeaser({ onNavigate }) {
  const { HOME_RESULTS } = useContent()
  const { t } = useI18n()

  return (
    <article className="home-teaser-card home-teaser-card--results">
      <div className="home-teaser-card__head">
        <span className="home-teaser-card__icon home-teaser-card__icon--celeste" aria-hidden>
          <Trophy size={16} strokeWidth={1.75} />
        </span>
        <span className="home-teaser-card__eyebrow">{HOME_RESULTS.eyebrow}</span>
      </div>

      <div className="home-teaser-card__body">
        <h2 className="home-teaser-card__title">{HOME_RESULTS.title}</h2>
        <p className="home-teaser-card__desc">{HOME_RESULTS.description}</p>
      </div>

      <button type="button" className="home-teaser-card__link" onClick={() => onNavigate('results')}>
        {t('pages.home.viewResults')}
        <ArrowRight size={14} aria-hidden />
      </button>
    </article>
  )
}
