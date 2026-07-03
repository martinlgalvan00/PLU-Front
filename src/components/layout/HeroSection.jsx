import { HOME_STATS } from '../../lib/content.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function HeroSection({ onNavigate }) {
  const { t } = useI18n()

  const metrics = [
    { value: t('hero.stat2026'), label: t('hero.stat2026Label') },
    { value: t('hero.statPluUsa'), label: t('hero.statPluUsaLabel') },
    { value: t('hero.statDigital'), label: t('hero.statDigitalLabel') },
  ]

  return (
    <section className="hero hero--design">
      <div className="hero__bg" aria-hidden />
      <div className="hero__content">
        <span className="hero__eyebrow hero__eyebrow--design">{t('hero.eyebrow')}</span>

        <h1 className="hero__title hero__title--design">
          {t('hero.titleLead')}{' '}
          <span className="hero__title-accent">{t('hero.titleAccent')}</span>.
        </h1>

        <p className="hero__lead">{t('hero.description')}</p>

        <div className="hero__cta-row">
          <button type="button" className="hero__cta hero__cta--primary" onClick={() => onNavigate('register')}>
            {t('hero.ctaAffiliate')}
          </button>
          <button type="button" className="hero__cta hero__cta--outline" onClick={() => onNavigate('pitbull')}>
            {t('hero.ctaPitbull')}
          </button>
        </div>

        <div className="hero__metrics" aria-label="Indicadores">
          {metrics.map(({ value, label }, index) => (
            <div key={label} className="hero__metric">
              <strong>{value}</strong>
              <span>{label}</span>
              {index < metrics.length - 1 && <span className="hero__metric-divider" aria-hidden />}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
