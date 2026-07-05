import { useI18n } from '../../i18n/I18nProvider.jsx'

const STATUS_STATS = [
  { labelKey: 'hero.statusRecognition', valueKey: 'hero.statPluUsa' },
  { labelKey: 'hero.statusAdmin', valueKey: 'hero.statusAdminValue' },
  { labelKey: 'hero.statusHQ', valueKey: 'hero.statusHQValue' },
  { labelKey: 'hero.statDigitalLabel', valueKey: 'hero.statDigital' },
]

export default function HeroStatusCard() {
  const { t } = useI18n()

  return (
    <div className="hero-status-card">
      <div className="hero-status-card__panel">
        <div className="hero-status-card__top">
          <div className="hero-status-card__brand">
            <span className="hero-status-card__dot" aria-hidden />
            <div className="hero-status-card__brand-copy">
              <span className="hero-status-card__eyebrow">{t('hero.statusCardEyebrow')}</span>
              <p className="hero-status-card__year" aria-label={t('hero.stat2026Label')}>
                {t('hero.stat2026')}
              </p>
            </div>
          </div>

          <dl className="hero-status-card__stats">
            {STATUS_STATS.map(({ labelKey, valueKey }) => (
              <div key={labelKey} className="hero-status-card__stat">
                <dt>{t(labelKey)}</dt>
                <dd>{t(valueKey)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="hero-status-card__live">
          <span className="hero-status-card__live-dot" aria-hidden />
          {t('hero.statusLive')}
        </p>
      </div>
    </div>
  )
}
