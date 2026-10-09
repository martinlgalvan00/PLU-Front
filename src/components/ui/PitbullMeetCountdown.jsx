import { useEffect, useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getCountdownParts } from '../../lib/countdown.js'
import AnimatedNumber from '../../motion/AnimatedNumber.tsx'
import TiltCard from '../../motion/TiltCard.tsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import {
  MOTION_BLUR,
  MOTION_DURATION,
  MOTION_EASE,
  MOTION_STAGGER,
  MOTION_VIEWPORT,
  SHOWCASE_TILT_MAX_DEG,
} from '../../motion/tokens.ts'
import { hasFinePointer } from '../../motion/useReducedMotion.ts'
import '../../styles/components/pitbull-meet-countdown.css'

function resolveMeetStartsAt(event) {
  if (event?.startsAt) return event.startsAt
  if (event?.dateISO) return `${event.dateISO}T09:00:00-03:00`
  return null
}

function pad2(value) {
  return String(Math.max(0, value)).padStart(2, '0')
}

const cardShell = {
  hidden: {
    opacity: 0,
    y: 22,
    scale: 0.985,
    filter: `blur(${MOTION_BLUR.sm}px)`,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      duration: MOTION_DURATION.cinematic,
      ease: MOTION_EASE.cinematic,
    },
  },
}

const layerStagger = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: MOTION_STAGGER.stepFast,
      delayChildren: 0.12,
    },
  },
}

const layerItem = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out },
  },
}

const stripeItem = {
  hidden: { scaleX: 0, opacity: 0 },
  visible: {
    scaleX: 1,
    opacity: 1,
    transition: {
      duration: MOTION_DURATION.slow,
      ease: MOTION_EASE.cinematic,
      delay: 0.18,
    },
  },
}

function CountdownDigits({ value, className = '' }) {
  const { reducedMotion } = useMotionConfig()
  const digits = pad2(value).split('')

  if (reducedMotion) {
    return <span className={className}>{digits.join('')}</span>
  }

  return (
    <span className={`pitbull-meet-countdown__digit-row ${className}`.trim()}>
      {digits.map((digit, index) => (
        <span key={`slot-${index}`} className="pitbull-meet-countdown__digit-slot">
          <AnimatePresence mode="popLayout" initial={false}>
            <m.span
              key={digit}
              className="pitbull-meet-countdown__digit"
              initial={{ opacity: 0, y: '48%' }}
              animate={{ opacity: 1, y: '0%' }}
              exit={{ opacity: 0, y: '-48%' }}
              transition={{
                duration: MOTION_DURATION.fast,
                ease: MOTION_EASE.out,
                delay: index * 0.015,
              }}
            >
              {digit}
            </m.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  )
}

/**
 * Card premium de cuenta regresiva al meet.
 * Tilt + stagger + dígitos flip; sin loops decorativos ni WebGL.
 */
export default function PitbullMeetCountdown({ event, dateLabel, onScrollToInscription }) {
  const { t } = useI18n()
  const { reducedMotion, tier } = useMotionConfig()
  const withDepth = !reducedMotion && tier !== 'low' && hasFinePointer()
  const startsAt = useMemo(() => resolveMeetStartsAt(event), [event])
  const [parts, setParts] = useState(() => (startsAt ? getCountdownParts(startsAt) : null))

  useEffect(() => {
    if (!startsAt) {
      setParts(null)
      return undefined
    }

    const tick = () => setParts(getCountdownParts(startsAt))
    tick()
    const intervalId = window.setInterval(tick, 1_000)
    return () => window.clearInterval(intervalId)
  }, [startsAt])

  if (!startsAt || !parts || parts.expired) return null

  const heroIsWeeks = parts.weeks > 0
  const heroValue = heroIsWeeks ? parts.weeks : parts.days
  const heroUnit = heroIsWeeks
    ? parts.weeks === 1
      ? t('pages.pitbull.meetCountdownWeeks_one')
      : t('pages.pitbull.meetCountdownWeeks_other')
    : parts.days === 1
      ? t('pages.pitbull.meetCountdownDays_one')
      : t('pages.pitbull.meetCountdownDays_other')

  const secondary = heroIsWeeks
    ? [
        {
          key: 'days',
          value: parts.daysRemainder,
          label:
            parts.daysRemainder === 1
              ? t('pages.pitbull.meetCountdownDays_one')
              : t('pages.pitbull.meetCountdownDays_other'),
        },
        {
          key: 'hours',
          value: parts.hours,
          label: t('pages.pitbull.meetCountdownHours'),
        },
        {
          key: 'minutes',
          value: parts.minutes,
          label: t('pages.pitbull.meetCountdownMinutes'),
        },
      ]
    : [
        {
          key: 'hours',
          value: parts.hours,
          label: t('pages.pitbull.meetCountdownHours'),
        },
        {
          key: 'minutes',
          value: parts.minutes,
          label: t('pages.pitbull.meetCountdownMinutes'),
        },
        {
          key: 'seconds',
          value: parts.seconds,
          label: t('pages.pitbull.meetCountdownSeconds'),
        },
      ]

  const body = (
    <div className="pitbull-meet-countdown__stack">
      <span className="pitbull-meet-countdown__grain" aria-hidden />
      <span className="pitbull-meet-countdown__watermark" aria-hidden>
        {heroValue}
      </span>

      <m.div
        className="pitbull-meet-countdown__face"
        variants={reducedMotion ? undefined : layerStagger}
        initial={reducedMotion ? undefined : 'hidden'}
        whileInView={reducedMotion ? undefined : 'visible'}
        viewport={MOTION_VIEWPORT}
      >
        <m.span
          className="pitbull-meet-countdown__stripe"
          aria-hidden
          variants={reducedMotion ? undefined : stripeItem}
          style={{ transformOrigin: 'left center' }}
        />

        <m.header className="pitbull-meet-countdown__copy" variants={reducedMotion ? undefined : layerItem}>
          <p className="pitbull-meet-countdown__eyebrow">{t('pages.pitbull.meetCountdownEyebrow')}</p>
          <p className="pitbull-meet-countdown__lead">{t('pages.pitbull.meetCountdownLead')}</p>
          {dateLabel ? <p className="pitbull-meet-countdown__date">{dateLabel}</p> : null}
        </m.header>

        <m.div
          className="pitbull-meet-countdown__hero"
          variants={reducedMotion ? undefined : layerItem}
          aria-live="polite"
        >
          <AnimatedNumber
            className="pitbull-meet-countdown__value"
            value={heroValue}
            duration={MOTION_DURATION.cinematic}
          />
          <span className="pitbull-meet-countdown__unit">{heroUnit}</span>
        </m.div>

        <m.div
          className="pitbull-meet-countdown__ticker"
          role="presentation"
          variants={reducedMotion ? undefined : layerItem}
        >
          {secondary.map((unit) => (
            <div key={unit.key} className="pitbull-meet-countdown__chip">
              <CountdownDigits value={unit.value} className="pitbull-meet-countdown__chip-value" />
              <span className="pitbull-meet-countdown__chip-label">{unit.label}</span>
            </div>
          ))}
        </m.div>

        {typeof onScrollToInscription === 'function' ? (
          <m.div
            className="pitbull-meet-countdown__actions"
            variants={reducedMotion ? undefined : layerItem}
          >
            <button
              type="button"
              className="pitbull-meet-countdown__cta motion-icon-shift"
              onClick={onScrollToInscription}
            >
              {t('pages.pitbull.meetCountdownCta')}
              <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
            </button>
          </m.div>
        ) : null}
      </m.div>
    </div>
  )

  const card = withDepth ? (
    <TiltCard
      className="pitbull-meet-countdown__tilt"
      innerClassName="tilt-card__inner pitbull-meet-countdown__plate"
      maxTilt={SHOWCASE_TILT_MAX_DEG}
    >
      {body}
    </TiltCard>
  ) : (
    <div className="pitbull-meet-countdown__plate pitbull-meet-countdown__plate--static">{body}</div>
  )

  return (
    <section className="pitbull-meet-countdown" aria-label={t('pages.pitbull.meetCountdownAria')}>
      {reducedMotion ? (
        card
      ) : (
        <m.div
          className="pitbull-meet-countdown__shell"
          variants={cardShell}
          initial="hidden"
          whileInView="visible"
          viewport={MOTION_VIEWPORT}
        >
          {card}
        </m.div>
      )}
    </section>
  )
}
