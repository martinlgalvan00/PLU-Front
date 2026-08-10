import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import heroPhoto from '../../assets/DSC00346-display.jpg'
import HeroStatusCard from '../ui/HeroStatusCard.jsx'
import HomeQuickBand from '../ui/HomeQuickBand.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE } from '../../motion/tokens.ts'
import {
  heroActionsItem,
  heroProofItem,
  heroSequenceItem,
  heroStaggerContainer,
  heroTitleLine,
} from '../../motion/variants.ts'

export default function HeroSection({ onNavigate }) {
  const { t } = useI18n()
  const { reducedMotion } = useMotionConfig()

  const kicker = (
    <>
      <span className="hero__kicker-dot" aria-hidden />
      {t('hero.kicker')}
    </>
  )

  const titleLines = (
    <>
      <span className="hero__title-line">{t('hero.titleLead')}</span>
      {' '}
      <span className="hero__title-line hero__title-line--accent">{t('hero.titleAccent')}</span>
    </>
  )

  const animatedTitle = (
    <>
      <m.span className="hero__title-line" variants={heroTitleLine}>
        {t('hero.titleLead')}
      </m.span>
      {' '}
      <m.span className="hero__title-line hero__title-line--accent" variants={heroTitleLine}>
        {t('hero.titleAccent')}
      </m.span>
    </>
  )

  const rule = reducedMotion ? (
    <span className="hero__rule motif-rule" aria-hidden />
  ) : (
    <m.span
      className="hero__rule motif-rule"
      aria-hidden
      variants={{
        hidden: { scaleX: 0 },
        visible: {
          scaleX: 1,
          transition: { duration: MOTION_DURATION.cinematic, ease: MOTION_EASE.cinematic },
        },
      }}
    />
  )

  const lead = (
    <>
      <span className="hero__lead-text">{t('hero.description')}</span>
      <span className="hero__lead-meta">{t('hero.descriptionMeta')}</span>
    </>
  )

  const actions = (
    <>
      <div className="hero__cta-row">
        <button
          type="button"
          className="hero__cta hero__cta--primary motion-icon-shift"
          onClick={() => onNavigate('members')}
        >
          {t('hero.ctaAffiliate')}
          <ArrowRight size={16} aria-hidden className="hero__cta-icon motion-icon-shift__target" />
        </button>
        <button
          type="button"
          className="hero__cta hero__cta--featured"
          onClick={() => onNavigate('events')}
        >
          <span className="hero__cta-label hero__cta-label--full">{t('hero.ctaEvents')}</span>
          <span className="hero__cta-label hero__cta-label--short">{t('hero.ctaEventsShort')}</span>
        </button>
      </div>

      <div className="hero__secondary-links">
        <button type="button" className="hero__secondary-link" onClick={() => onNavigate('pitbull')}>
          {t('hero.ctaPitbull')}
          <ArrowRight size={12} aria-hidden className="hero__secondary-link-icon" />
        </button>
        <button type="button" className="hero__account-pill" onClick={() => onNavigate('login')}>
          {t('hero.ctaAccount')}
        </button>
      </div>
    </>
  )

  return (
    <section className="hero hero--design hero--motion">
      <div className="hero__backdrop" aria-hidden>
        <img
          className="hero__backdrop-img"
          src={heroPhoto}
          alt=""
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
      </div>

      <div className="hero__copy">
        <div className="hero__shell">
          {reducedMotion ? (
            <div className="hero__copy-inner">
              <div className="hero__main">
                <div className="hero__editorial">
                  <p className="hero__kicker">{kicker}</p>
                  {rule}
                  <h1 className="hero__title hero__title--design">{titleLines}</h1>
                  <p className="hero__lead">{lead}</p>
                </div>
                <div className="hero__actions">{actions}</div>
              </div>
              <div className="hero__proof">
                <HeroStatusCard onSelect={() => onNavigate('pitbull')} />
              </div>
            </div>
          ) : (
            <div className="hero__copy-inner">
              <div className="hero__main">
                <m.div
                  className="hero__editorial"
                  initial="hidden"
                  animate="visible"
                  variants={heroStaggerContainer}
                >
                  <m.p className="hero__kicker" variants={heroSequenceItem}>
                    {kicker}
                  </m.p>
                  {rule}
                  <m.h1 className="hero__title hero__title--design" variants={heroStaggerContainer}>
                    {animatedTitle}
                  </m.h1>
                  <m.p className="hero__lead" variants={heroSequenceItem}>
                    {lead}
                  </m.p>
                </m.div>
                <m.div
                  className="hero__actions"
                  initial="hidden"
                  animate="visible"
                  variants={heroActionsItem}
                >
                  {actions}
                </m.div>
              </div>
              <m.div
                className="hero__proof"
                initial="hidden"
                animate="visible"
                variants={heroProofItem}
              >
                <HeroStatusCard onSelect={() => onNavigate('pitbull')} />
              </m.div>
            </div>
          )}
        </div>
      </div>

      <HomeQuickBand onNavigate={onNavigate} variant="dock" />
    </section>
  )
}
