import { ArrowRight } from 'lucide-react'
import HeroStatusCard from '../ui/HeroStatusCard.jsx'
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
      <div className="hero__grid">
        <div className="hero__copy">
          <div className="hero__copy-bg" aria-hidden />
          <div className="hero__copy-inner">
            <span className="hero__eyebrow hero__eyebrow--design">{t('hero.eyebrow')}</span>

            <h1 className="hero__title hero__title--design">
              {t('hero.titleLead')}{' '}
              <span className="hero__title-accent">{t('hero.titleAccent')}</span>.
            </h1>

            <p className="hero__lead">{t('hero.description')}</p>

            <div className="hero__cta-row">
              <button type="button" className="hero__cta hero__cta--primary" onClick={() => onNavigate('members')}>
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

            <div className="hero__secondary-links">
              <button type="button" className="hero__secondary-link" onClick={() => onNavigate('events')}>
                {t('hero.ctaEvents')} →
              </button>
              <button type="button" className="hero__account-pill" onClick={() => onNavigate('login')}>
                {t('hero.ctaAccount')}
                <span className="hero__account-pill-icon" aria-hidden>
                  <ArrowRight size={11} strokeWidth={2.5} />
                </span>
              </button>
            </div>
          </div>
        </div>

        <aside className="hero__aside" aria-label={t('hero.statusCardEyebrow')}>
          <div className="hero__aside-bg" aria-hidden />
          <HeroStatusCard />
        </aside>
      </div>
    </section>
  )
}
