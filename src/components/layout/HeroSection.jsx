import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import HeroStatusCard from '../ui/HeroStatusCard.jsx'
import HomeQuickBand from '../ui/HomeQuickBand.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function HeroSection({ onNavigate }) {
  const { t } = useI18n()
  const [animate, setAnimate] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimate(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <section className={`hero hero--design${animate ? ' is-animate' : ''}`}>
      <div className="hero__ambient hero__ambient--red" aria-hidden />
      <div className="hero__ambient hero__ambient--celeste" aria-hidden />

      <div className="hero__copy">
        <div className="hero__copy-bg" aria-hidden />
        <div className="hero__copy-inner">
          <span className="hero__eyebrow hero__eyebrow--design">
            <span className="hero__eyebrow-dot" aria-hidden />
            {t('hero.eyebrow')}
          </span>

          <h1 className="hero__title hero__title--design">
            {t('hero.titleLead')}{' '}
            <span className="hero__title-accent">{t('hero.titleAccent')}</span>.
          </h1>

          <p className="hero__lead">{t('hero.description')}</p>

          <div className="hero__cta-row">
            <button type="button" className="hero__cta hero__cta--primary" onClick={() => onNavigate('members')}>
              {t('hero.ctaAffiliate')}
              <ArrowRight size={15} aria-hidden className="hero__cta-icon" />
            </button>
            <button type="button" className="hero__cta hero__cta--outline" onClick={() => onNavigate('pitbull')}>
              {t('hero.ctaPitbull')}
            </button>
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

          <div className="hero__proof">
            <HeroStatusCard />
          </div>
        </div>
      </div>

      <HomeQuickBand onNavigate={onNavigate} variant="dock" />
    </section>
  )
}