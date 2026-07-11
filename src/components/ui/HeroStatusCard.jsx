import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function HeroStatusCard() {
  const { t } = useI18n()

  const stats = [
    { key: 'pluUsa', label: t('hero.statPluUsaLabel'), value: t('hero.statPluUsa') },
    { key: 'season', label: t('hero.stat2026Label'), value: t('hero.stat2026') },
    { key: 'digital', label: t('hero.statDigitalLabel'), value: t('hero.statDigital') },
  ]

  return (
    <div className="hero-meta">
      <dl className="hero-meta__grid">
        {stats.map((stat) => (
          <div className="hero-meta__stat" key={stat.key}>
            <dt className="hero-meta__label">{stat.label}</dt>
            <dd className="hero-meta__value">{stat.value}</dd>
          </div>
        ))}
      </dl>
      <p className="hero-meta__next">
        <span className="hero-meta__next-value">{t('hero.statusNextMeetValue')}</span>
        <span className="hero-meta__sep" aria-hidden>·</span>
        <span className="hero-meta__next-note">{t('hero.statusLive')}</span>
      </p>
    </div>
  )
}
