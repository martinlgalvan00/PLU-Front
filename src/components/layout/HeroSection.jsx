import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import HeroStatusCard from '../ui/HeroStatusCard.jsx'
import HomeQuickBand from '../ui/HomeQuickBand.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { heroSequenceItem, heroStaggerContainer } from '../../motion/variants.ts'

export default function HeroSection({ onNavigate }) {
  const { t } = useI18n()
  const { reducedMotion } = useMotionConfig()
  const accentOnLead = t('hero.headlineAccentOn') === 'lead'

  const editorial = (
    <div className="hero__editorial">
      <p className="hero__kicker">
        <span className="hero__kicker-dot" aria-hidden />
        {t('hero.kicker')}
      </p>

      <h1 className="hero__title hero__title--design">
        <span className={`hero__title-line${accentOnLead ? ' hero__title-line--accent' : ''}`}>
          {t('hero.headlineLead')}
        </span>
        <span className={`hero__title-line${accentOnLead ? '' : ' hero__title-line--accent'}`}>
          {t('hero.headlineAccent')}
        </span>
      </h1>

      <p className="hero__lead">
        <span className="hero__lead-text">{t('hero.description')}</span>
        <span className="hero__lead-meta">{t('hero.descriptionMeta')}</span>
      </p>
    </div>
  )

  const actions = (
    <div className="hero__actions">
      <div className="hero__cta-row">
        <button type="button" className="hero__cta hero__cta--primary" onClick={() => onNavigate('members')}>
          {t('hero.ctaAffiliate')}
          <ArrowRight size={15} aria-hidden className="hero__cta-icon" />
        </button>
        <button type="button" className="hero__cta hero__cta--outline" onClick={() => onNavigate('pitbull')}>
          <span className="hero__cta-label hero__cta-label--full">{t('hero.ctaPitbull')}</span>
          <span className="hero__cta-label hero__cta-label--short">{t('hero.ctaPitbullShort')}</span>
        </button>
      </div>

      <div className="hero__secondary-links">
        <button type="button" className="hero__secondary-link" onClick={() => onNavigate('events')}>
          {t('hero.ctaEvents')}
          <ArrowRight size={12} aria-hidden className="hero__secondary-link-icon" />
        </button>
        <button type="button" className="hero__account-pill" onClick={() => onNavigate('login')}>
          {t('hero.ctaAccount')}
          <span className="hero__account-pill-icon" aria-hidden>
            <ArrowRight size={11} strokeWidth={2.5} />
          </span>
        </button>
      </div>
    </div>
  )

  return (
    <section className="hero hero--design hero--motion">
      <div className="hero__copy">
        <div className="hero__shell">
          {reducedMotion ? (
            <div className="hero__copy-inner">
              <div className="hero__main">
                {editorial}
                {actions}
              </div>
              <div className="hero__proof">
                <HeroStatusCard />
              </div>
            </div>
          ) : (
            <m.div
              className="hero__copy-inner"
              initial="hidden"
              animate="visible"
              variants={heroStaggerContainer}
            >
              <m.div className="hero__main hero-sequence__item" variants={heroSequenceItem}>
                <m.div className="hero__editorial" variants={heroStaggerContainer}>
                  <m.p className="hero__kicker" variants={heroSequenceItem}>
                    <span className="hero__kicker-dot" aria-hidden />
                    {t('hero.kicker')}
                  </m.p>
                  <m.h1 className="hero__title hero__title--design" variants={heroSequenceItem}>
                    <span className={`hero__title-line${accentOnLead ? ' hero__title-line--accent' : ''}`}>
                      {t('hero.headlineLead')}
                    </span>
                    <span className={`hero__title-line${accentOnLead ? '' : ' hero__title-line--accent'}`}>
                      {t('hero.headlineAccent')}
                    </span>
                  </m.h1>
                  <m.p className="hero__lead" variants={heroSequenceItem}>
                    <span className="hero__lead-text">{t('hero.description')}</span>
                    <span className="hero__lead-meta">{t('hero.descriptionMeta')}</span>
                  </m.p>
                </m.div>
                <m.div className="hero__actions hero-sequence__item" variants={heroSequenceItem}>
                  {actions}
                </m.div>
              </m.div>
              <m.div className="hero__proof hero-sequence__item" variants={heroSequenceItem}>
                <HeroStatusCard />
              </m.div>
            </m.div>
          )}
        </div>
      </div>

      <HomeQuickBand onNavigate={onNavigate} variant="dock" />
    </section>
  )
}
