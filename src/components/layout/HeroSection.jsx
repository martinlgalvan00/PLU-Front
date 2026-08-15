import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import { useMemo } from 'react'
import heroPhoto from '../../assets/DSC00346-display.jpg'
import heroPhotoAvif from '../../assets/DSC00346-display.avif'
import heroPhotoAvif640 from '../../assets/DSC00346-display-640.avif'
import heroPhotoAvif1280 from '../../assets/DSC00346-display-1280.avif'
import heroPhotoWebp from '../../assets/DSC00346-display.webp'
import heroPhotoWebp640 from '../../assets/DSC00346-display-640.webp'
import heroPhotoWebp1280 from '../../assets/DSC00346-display-1280.webp'
import HeroStatusCard from '../ui/HeroStatusCard.jsx'
import HomeQuickBand from '../ui/HomeQuickBand.jsx'
import ResponsivePhoto from '../ui/ResponsivePhoto.jsx'
import { env } from '../../config/env.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { isPaidCheckoutOpen } from '../../lib/registrationSchedule.js'
import { isRegistrationOpen } from '../../lib/status.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE, MOTION_STAGGER_BY_TIER } from '../../motion/tokens.ts'
import {
  heroActionsItem,
  heroProofItem,
  heroSequenceItem,
  heroTitleLine,
} from '../../motion/variants.ts'

export default function HeroSection({ onNavigate, event }) {
  const { t } = useI18n()
  const { reducedMotion, tier } = useMotionConfig()
  const eventStatus = event?.status ?? 'proximamente'
  const registrationCheckoutOpen = isPaidCheckoutOpen(event, env, new Date(), {
    checkoutKind: 'registration',
  })
  const registrationAvailable =
    registrationCheckoutOpen &&
    isRegistrationOpen(eventStatus)
  const statusLabelOverride = registrationAvailable
    ? t('hero.statusRegistrationOpen')
    : undefined
  // Cascada propia del hero (no la heroStaggerContainer compartida con
  // Tickets/PluPageHero/PitbullHero) para escalarla por tier de dispositivo
  // sin afectar esas otras páginas. Ver src/motion/deviceTier.ts.
  const heroStagger = useMemo(() => {
    const { step, delayChildren } = MOTION_STAGGER_BY_TIER[tier]
    return {
      hidden: {},
      visible: { transition: { staggerChildren: step, delayChildren } },
    }
  }, [tier])

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
        <ResponsivePhoto
          className="hero__backdrop-img"
          avif={{ 640: heroPhotoAvif640, 1280: heroPhotoAvif1280, 2048: heroPhotoAvif }}
          webp={{ 640: heroPhotoWebp640, 1280: heroPhotoWebp1280, 2048: heroPhotoWebp }}
          src={heroPhoto}
          alt=""
          loading="eager"
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
                <HeroStatusCard
                  event={event}
                  onSelect={() => onNavigate('pitbull')}
                  statusLabelOverride={statusLabelOverride}
                />
              </div>
            </div>
          ) : (
            <div className="hero__copy-inner">
              <div className="hero__main">
                <m.div
                  className="hero__editorial"
                  initial="hidden"
                  animate="visible"
                  variants={heroStagger}
                >
                  <m.p className="hero__kicker" variants={heroSequenceItem}>
                    {kicker}
                  </m.p>
                  {rule}
                  <m.h1 className="hero__title hero__title--design" variants={heroStagger}>
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
                <HeroStatusCard
                  event={event}
                  onSelect={() => onNavigate('pitbull')}
                  statusLabelOverride={statusLabelOverride}
                />
              </m.div>
            </div>
          )}
        </div>
      </div>

      <HomeQuickBand onNavigate={onNavigate} variant="dock" />
    </section>
  )
}
