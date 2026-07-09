import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function HeroStatusCard() {
  const { t } = useI18n()

  return (
    <div className="hero-meta">
      <p className="hero-meta__line">
        <span>{t('hero.statPluUsa')}</span>
        <span className="hero-meta__sep" aria-hidden>·</span>
        <span>{t('hero.stat2026')}</span>
        <span className="hero-meta__sep" aria-hidden>·</span>
        <span>{t('hero.statusNextMeetValue')}</span>
      </p>
      <p className="hero-meta__note">{t('hero.statusLive')}</p>
    </div>
  )
}
