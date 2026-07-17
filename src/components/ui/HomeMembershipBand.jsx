import { useEffect, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import HomeMembershipArtifact from './HomeMembershipArtifact.jsx'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE } from '../../motion/tokens.ts'

const REEL_INTERVAL_MS = 4200

const slideVariants = {
  enter: (direction) => ({
    opacity: 0,
    y: direction > 0 ? 14 : -14,
  }),
  center: {
    opacity: 1,
    y: 0,
  },
  exit: (direction) => ({
    opacity: 0,
    y: direction > 0 ? -10 : 10,
  }),
}

const copyContainer = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05,
    },
  },
}

const copyItem = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  },
}

export default function HomeMembershipBand({ onNavigate }) {
  const { HOME_MEMBERSHIP, HOME_MEMBERSHIP_BENEFITS } = useContent()
  const { t } = useI18n()
  const { reducedMotion } = useMotionConfig()
  const benefits = HOME_MEMBERSHIP_BENEFITS ?? []
  const [activeIndex, setActiveIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (reducedMotion || paused || benefits.length < 2) return undefined

    const timer = window.setInterval(() => {
      setDirection(1)
      setActiveIndex((current) => (current + 1) % benefits.length)
    }, REEL_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [benefits.length, paused, reducedMotion])

  function selectBenefit(index) {
    if (index === activeIndex) return
    setDirection(index > activeIndex ? 1 : -1)
    setActiveIndex(index)
  }

  function stepBenefit(delta) {
    if (benefits.length < 2) return
    setDirection(delta > 0 ? 1 : -1)
    setActiveIndex((current) => (current + delta + benefits.length) % benefits.length)
  }

  const active = benefits[activeIndex] ?? benefits[0]
  const indexLabel = String(activeIndex + 1).padStart(2, '0')
  const totalLabel = String(benefits.length).padStart(2, '0')

  const CopyShell = reducedMotion ? 'div' : m.div
  const copyProps = reducedMotion
    ? { className: 'home-membership-band__copy' }
    : {
        className: 'home-membership-band__copy',
        variants: copyContainer,
        initial: 'hidden',
        whileInView: 'visible',
        viewport: { once: true, amount: 0.35 },
      }

  const CopyItem = reducedMotion ? 'div' : m.div
  const itemProps = reducedMotion ? {} : { variants: copyItem }

  return (
    <div className="home-membership-band">
      <CopyShell {...copyProps}>
        <CopyItem {...itemProps} className="home-membership-band__intro">
          <p className="home-membership-band__eyebrow">{HOME_MEMBERSHIP.eyebrow}</p>
          <h2 className="home-membership-band__title">
            <span className="home-membership-band__title-lead">{HOME_MEMBERSHIP.titleLead}</span>
            <span className="home-membership-band__title-accent">{HOME_MEMBERSHIP.titleAccent}</span>
          </h2>
          <p className="home-membership-band__desc">{HOME_MEMBERSHIP.description}</p>
          <p className="home-membership-band__meta">
            <span>{HOME_MEMBERSHIP.seasonNote}</span>
            <span aria-hidden className="home-membership-band__meta-sep">
              ·
            </span>
            <span>{HOME_MEMBERSHIP.planLabel}</span>
          </p>
        </CopyItem>

        <CopyItem {...itemProps} className="home-membership-band__actions">
          <button
            type="button"
            className="home-membership-band__cta"
            onClick={() => onNavigate('members')}
          >
            {HOME_MEMBERSHIP.cta}
            <ArrowRight size={15} aria-hidden className="home-membership-band__cta-icon" />
          </button>
        </CopyItem>
      </CopyShell>

      <aside
        className={`home-membership-reel${paused ? ' is-paused' : ''}`.trim()}
        aria-roledescription="carousel"
        aria-label={t('pages.membershipCard.benefitsReelAria')}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false)
        }}
      >
        <div className="home-membership-reel__meta">
          <span className="home-membership-reel__counter" aria-live="polite">
            {reducedMotion ? (
              <>
                {indexLabel}
                <span aria-hidden> / </span>
                {totalLabel}
              </>
            ) : (
              <>
                <span className="home-membership-reel__counter-current">
                  <AnimatePresence mode="wait" initial={false}>
                    <m.span
                      key={indexLabel}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: MOTION_DURATION.fast, ease: MOTION_EASE.out }}
                    >
                      {indexLabel}
                    </m.span>
                  </AnimatePresence>
                </span>
                <span aria-hidden> / </span>
                {totalLabel}
              </>
            )}
          </span>
          <div className="home-membership-reel__progress" aria-hidden>
            <span
              key={activeIndex}
              className={`home-membership-reel__progress-bar${paused || reducedMotion ? ' is-paused' : ''}`}
              style={{ '--reel-duration': `${REEL_INTERVAL_MS}ms` }}
            />
          </div>
          <div className="home-membership-reel__controls">
            <button
              type="button"
              className="home-membership-reel__control"
              aria-label={t('pages.membershipCard.benefitsPrev')}
              onClick={() => stepBenefit(-1)}
            >
              <ChevronLeft size={16} strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              className="home-membership-reel__control"
              aria-label={t('pages.membershipCard.benefitsNext')}
              onClick={() => stepBenefit(1)}
            >
              <ChevronRight size={16} strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>

        {reducedMotion ? (
          <div className="home-membership-reel__stage">
            <span className="home-membership-reel__glow" aria-hidden />
            <div className="home-membership-reel__copy">
              <h3 className="home-membership-reel__title">{active?.title}</h3>
              <p className="home-membership-reel__text">{active?.text}</p>
            </div>
            <div className="home-membership-reel__artifact-stage">
              <span className="home-membership-reel__halo" aria-hidden />
              <HomeMembershipArtifact benefitId={active?.id} paused reducedMotion />
              <span className="home-membership-reel__plinth" aria-hidden />
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <m.div
              key={active?.id ?? activeIndex}
              className="home-membership-reel__stage"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: MOTION_DURATION.slow, ease: MOTION_EASE.out }}
            >
              <span className="home-membership-reel__glow" aria-hidden />
              <div className="home-membership-reel__copy">
                <m.h3
                  className="home-membership-reel__title"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: MOTION_DURATION.slow, ease: MOTION_EASE.out, delay: 0.04 }}
                >
                  {active?.title}
                </m.h3>
                <m.p
                  className="home-membership-reel__text"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: MOTION_DURATION.slow, ease: MOTION_EASE.out, delay: 0.1 }}
                >
                  {active?.text}
                </m.p>
              </div>
              <div className="home-membership-reel__artifact-stage">
                <span className="home-membership-reel__halo" aria-hidden />
                <HomeMembershipArtifact benefitId={active?.id} paused={paused} reducedMotion={false} />
                <span className="home-membership-reel__plinth" aria-hidden />
              </div>
            </m.div>
          </AnimatePresence>
        )}

        <div
          className="home-membership-reel__dots"
          role="tablist"
          aria-label={t('pages.membershipCard.benefitsNavAria')}
        >
          {benefits.map((benefit, index) => (
            <button
              key={benefit.id}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              aria-label={benefit.title}
              className={`home-membership-reel__dot${index === activeIndex ? ' is-active' : ''}`}
              onClick={() => selectBenefit(index)}
            />
          ))}
        </div>
      </aside>
    </div>
  )
}
