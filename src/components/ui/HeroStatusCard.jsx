import { useI18n } from '../../i18n/I18nProvider.jsx'

const STATUS_ROWS = [
  { labelKey: 'hero.statusRecognition', valueKey: 'hero.statPluUsa' },
  { labelKey: 'hero.statusAdmin', valueKey: 'hero.statusAdminValue' },
  { labelKey: 'hero.statusHQ', valueKey: 'hero.statusHQValue' },
]

export default function HeroStatusCard() {
  const { t } = useI18n()

  return (
    <div className="hero-status-card">
      <div className="hero-status-card__panel">
        <div className="hero-status-card__header">
          <span className="hero-status-card__dot" aria-hidden />
          <span className="hero-status-card__eyebrow">{t('hero.statusCardEyebrow')}</span>
        </div>

        <p className="hero-status-card__year" aria-label={t('hero.stat2026Label')}>
          {t('hero.stat2026')}
        </p>

        <div className="hero-status-card__divider" aria-hidden />

        <dl className="hero-status-card__rows">
          {STATUS_ROWS.map(({ labelKey, valueKey }) => (
            <div key={labelKey} className="hero-status-card__row">
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
  )
}
