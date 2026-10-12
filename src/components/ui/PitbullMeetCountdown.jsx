import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { AnimatePresence, m, useInView } from 'motion/react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  getCountdownHeadline,
  getCountdownParts,
  resolveEventStartsAt,
} from '../../lib/countdown.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import TickNumber from '../../motion/TickNumber.tsx'
import { MOTION_DURATION, MOTION_EASE } from '../../motion/tokens.ts'
import '../../styles/components/meet-surface.css'
import '../../styles/components/pitbull-meet-countdown.css'
import BarbellLoad, { BARBELL_MAX_PLATES } from './BarbellLoad.jsx'

const PLATE_STEP_MS = 260
const LOAD_DELAY_S = 0.45

function pad2(value) {
  return String(Math.max(0, value)).padStart(2, '0')
}

/** Dígitos que ruedan al cambiar: solo el que cambia se anima. */
function Digits({ value }) {
  const { reducedMotion } = useMotionConfig()
  const digits = pad2(value).split('')

  if (reducedMotion) return <span className="meet-clock__digits">{digits.join('')}</span>

  return (
    <span className="meet-clock__digits">
      {digits.map((digit, index) => (
        <span key={`slot-${index}`} className="meet-clock__slot">
          <AnimatePresence mode="popLayout" initial={false}>
            <m.span
              key={digit}
              className="meet-clock__digit"
              initial={{ opacity: 0, y: '55%' }}
              animate={{ opacity: 1, y: '0%' }}
              exit={{ opacity: 0, y: '-55%' }}
              transition={{ duration: MOTION_DURATION.fast, ease: MOTION_EASE.out }}
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
 * "Hasta el Classic": el tiempo que falta, cargado en una barra. Un disco por
 * semana (o por día / hora cuando ya falta menos); el número sube al ritmo en
 * que aterrizan los discos y, cuando se cumple una semana, el último disco
 * se descarga solo. Debajo, el reloj fino (días · horas · min · seg).
 *
 * Solo transform + opacity, sin loops. Superficie grafito fija en ambos temas.
 */
export default function PitbullMeetCountdown({ event, dateLabel, onScrollToInscription }) {
  const { t } = useI18n()
  const { reducedMotion, tier } = useMotionConfig()
  const startsAt = useMemo(() => resolveEventStartsAt(event), [event])
  const [parts, setParts] = useState(() => (startsAt ? getCountdownParts(startsAt) : null))
  const rootRef = useRef(null)
  const seen = useInView(rootRef, { once: true, amount: 0.35 })
  const play = reducedMotion || tier === 'low' || seen

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

  const { unit, value } = getCountdownHeadline(parts)
  const plural = value === 1 ? 'one' : 'other'
  const unitLabel = t(
    `pages.pitbull.countdownIntro${unit[0].toUpperCase()}${unit.slice(1)}_${plural}`,
  )
  const lead = t(`pages.pitbull.countdownIntroLead_${plural}`)
  const trail = t('pages.pitbull.countdownIntroTrail')
  const plates = Math.min(value, BARBELL_MAX_PLATES)

  const clock =
    unit === 'weeks'
      ? [
          {
            key: 'days',
            value: parts.daysRemainder,
            label: t('pages.pitbull.meetCountdownDays_other'),
          },
          { key: 'hours', value: parts.hours, label: t('pages.pitbull.meetCountdownHours') },
          { key: 'minutes', value: parts.minutes, label: t('pages.pitbull.meetCountdownMinutes') },
          { key: 'seconds', value: parts.seconds, label: t('pages.pitbull.meetCountdownSeconds') },
        ]
      : unit === 'days'
        ? [
            { key: 'hours', value: parts.hours, label: t('pages.pitbull.meetCountdownHours') },
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
        : [
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

  const Shell = reducedMotion ? 'div' : m.div
  const shellProps = reducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 20 },
        animate: play ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 },
        transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.cinematic },
      }

  return (
    <section
      ref={rootRef}
      className="pitbull-meet-countdown"
      aria-label={t('pages.pitbull.meetCountdownAria')}
    >
      <Shell className="meet-clock meet-surface" {...shellProps}>
        <p className="visually-hidden" role="status">
          {[lead, value, unitLabel, trail].filter(Boolean).join(' ')}
        </p>

        <header className="meet-clock__head">
          <p className="meet-clock__eyebrow">{t('pages.pitbull.meetCountdownEyebrow')}</p>
          {dateLabel ? <p className="meet-clock__date">{dateLabel}</p> : null}
        </header>

        <div className="meet-clock__main" aria-hidden>
          <div className="meet-clock__headline">
            <p className="meet-clock__lead">{lead}</p>
            <p className="meet-clock__count">
              <TickNumber
                className="meet-clock__value"
                value={value}
                play={play}
                delay={LOAD_DELAY_S}
                duration={(plates * PLATE_STEP_MS) / 1000}
              />
              <span className="meet-clock__unit">{unitLabel}</span>
            </p>
            {trail ? <p className="meet-clock__trail">{trail}</p> : null}
          </div>

          <BarbellLoad
            className="meet-clock__bar"
            count={value}
            play={play}
            delay={LOAD_DELAY_S}
            stepMs={PLATE_STEP_MS}
          />
        </div>

        <dl className="meet-clock__readout" style={{ '--cells': clock.length }}>
          {clock.map((cell) => (
            <div key={cell.key} className="meet-clock__cell">
              <dt>{cell.label}</dt>
              <dd>
                <Digits value={cell.value} />
              </dd>
            </div>
          ))}
        </dl>

        {typeof onScrollToInscription === 'function' ? (
          <button
            type="button"
            className="meet-clock__cta motion-icon-shift"
            onClick={onScrollToInscription}
          >
            {t('pages.pitbull.meetCountdownCta')}
            <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
          </button>
        ) : null}
      </Shell>
    </section>
  )
}
