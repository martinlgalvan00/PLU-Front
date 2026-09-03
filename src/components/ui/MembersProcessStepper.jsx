import { useEffect, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardPen,
  QrCode,
  WalletCards,
} from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import {
  MOTION_BLUR,
  MOTION_DURATION,
  MOTION_EASE,
  MOTION_STAGGER,
  MOTION_VIEWPORT,
} from '../../motion/tokens.ts'
import MembersBlockHead from './MembersBlockHead.jsx'

const SCENE_INTERVAL_MS = 4800

const STEP_ICONS = [ClipboardPen, WalletCards, QrCode, CheckCircle2]

const headMotion = {
  hidden: { opacity: 0, x: -10, y: 8 },
  show: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: { duration: MOTION_DURATION.cinematic, ease: MOTION_EASE.out },
  },
}

const sceneVariants = {
  enter: (direction) => ({
    opacity: 0,
    x: direction > 0 ? 18 : -18,
    y: 6,
    filter: `blur(${MOTION_BLUR.sm}px)`,
  }),
  center: {
    opacity: 1,
    x: 0,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      duration: MOTION_DURATION.slow,
      ease: MOTION_EASE.out,
      staggerChildren: MOTION_STAGGER.stepFast,
      delayChildren: 0.05,
    },
  },
  exit: (direction) => ({
    opacity: 0,
    x: direction > 0 ? -12 : 12,
    y: -4,
    filter: `blur(${MOTION_BLUR.sm}px)`,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.inOut },
  }),
}

const sceneChild = {
  enter: { opacity: 0, y: 10 },
  center: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out },
  },
}

/**
 * Proceso de afiliación — escenario cinematográfico + timeline (sin cards).
 */
export default function MembersProcessStepper({ steps = [], ariaLabel, eyebrow, title, lead }) {
  const { t } = useI18n()
  const { reducedMotion, tier } = useMotionConfig()
  const minimalMotion = reducedMotion || tier === 'low'
  const [activeIndex, setActiveIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const [paused, setPaused] = useState(false)
  const stepCount = Math.max(steps.length, 1)

  useEffect(() => {
    if (minimalMotion || paused || steps.length < 2) return undefined

    const timer = window.setInterval(() => {
      setDirection(1)
      setActiveIndex((current) => (current + 1) % steps.length)
    }, SCENE_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [minimalMotion, paused, steps.length])

  function selectStep(index) {
    if (index === activeIndex) return
    setDirection(index > activeIndex ? 1 : -1)
    setActiveIndex(index)
  }

  function handleStagePointer(event) {
    if (minimalMotion) return
    const el = event.currentTarget
    const rect = el.getBoundingClientRect()
    const nx = (event.clientX - rect.left) / rect.width
    const ny = (event.clientY - rect.top) / rect.height
    el.style.setProperty('--px', (nx - 0.5).toFixed(3))
    el.style.setProperty('--py', (ny - 0.5).toFixed(3))
    el.style.setProperty('--glow-x', `${(nx * 100).toFixed(1)}%`)
    el.style.setProperty('--glow-y', `${(ny * 100).toFixed(1)}%`)
    el.style.setProperty('--active', '1')
  }

  function resetStagePointer(event) {
    const el = event.currentTarget
    el.style.setProperty('--px', '0')
    el.style.setProperty('--py', '0')
    el.style.setProperty('--active', '0')
  }

  function stepBy(delta) {
    if (steps.length < 2) return
    setDirection(delta > 0 ? 1 : -1)
    setActiveIndex((current) => (current + delta + steps.length) % steps.length)
  }

  if (!steps.length) return null

  const active = steps[activeIndex] ?? steps[0]
  const indexLabel = String(activeIndex + 1).padStart(2, '0')
  const totalLabel = String(stepCount).padStart(2, '0')
  const Icon = STEP_ICONS[activeIndex % STEP_ICONS.length] ?? ClipboardPen

  const head = <MembersBlockHead eyebrow={eyebrow} title={title} lead={lead} />

  return (
    <div className="members-plu-stepper members-plu-stepper--timeline" aria-label={ariaLabel}>
      {minimalMotion ? (
        head
      ) : (
        <m.div variants={headMotion} initial="hidden" whileInView="show" viewport={MOTION_VIEWPORT}>
          {head}
        </m.div>
      )}

      <div
        className={`members-plu-stepper__showcase${paused ? ' is-paused' : ''}`}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false)
        }}
      >
        <div
          className="members-plu-stepper__stage"
          aria-live="polite"
          onPointerMove={minimalMotion ? undefined : handleStagePointer}
          onPointerLeave={minimalMotion ? undefined : resetStagePointer}
        >
          <span className="members-plu-stepper__glow" aria-hidden />
          <span className="members-plu-stepper__ghost" aria-hidden>
            {indexLabel}
          </span>

          <div className="members-plu-stepper__stage-meta">
            <span className="members-plu-stepper__counter">
              {minimalMotion ? (
                <>
                  {indexLabel}
                  <span aria-hidden> / </span>
                  {totalLabel}
                </>
              ) : (
                <>
                  <span className="members-plu-stepper__counter-current">
                    <AnimatePresence mode="wait" initial={false}>
                      <m.span
                        key={indexLabel}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
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

            <div className="members-plu-stepper__progress" aria-hidden>
              <span
                key={activeIndex}
                className={`members-plu-stepper__progress-bar${paused || minimalMotion ? ' is-paused' : ''}`}
                style={{ '--scene-duration': `${SCENE_INTERVAL_MS}ms` }}
              />
            </div>

            <div className="members-plu-stepper__controls">
              <button
                type="button"
                className="members-plu-stepper__control"
                aria-label={t('pages.members.processPrev')}
                onClick={() => stepBy(-1)}
              >
                <ChevronLeft size={16} strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                className="members-plu-stepper__control"
                aria-label={t('pages.members.processNext')}
                onClick={() => stepBy(1)}
              >
                <ChevronRight size={16} strokeWidth={2} aria-hidden />
              </button>
            </div>
          </div>

          {minimalMotion ? (
            <div className="members-plu-stepper__scene">
              <span className="members-plu-stepper__scene-icon" aria-hidden>
                <Icon size={28} strokeWidth={1.5} />
              </span>
              <span className="members-plu-stepper__scene-index" aria-hidden>
                {indexLabel}
              </span>
              <h3 className="members-plu-stepper__scene-title">{active.title}</h3>
              <p className="members-plu-stepper__scene-text">{active.text}</p>
            </div>
          ) : (
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <m.div
                key={active.step ?? indexLabel}
                className="members-plu-stepper__scene"
                custom={direction}
                variants={sceneVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                <m.span
                  className="members-plu-stepper__scene-icon"
                  aria-hidden
                  variants={sceneChild}
                >
                  <Icon size={28} strokeWidth={1.5} />
                </m.span>
                <m.span
                  className="members-plu-stepper__scene-index"
                  aria-hidden
                  variants={sceneChild}
                >
                  {indexLabel}
                </m.span>
                <m.h3 className="members-plu-stepper__scene-title" variants={sceneChild}>
                  {active.title}
                </m.h3>
                <m.p className="members-plu-stepper__scene-text" variants={sceneChild}>
                  {active.text}
                </m.p>
              </m.div>
            </AnimatePresence>
          )}
        </div>

        <ol
          className="members-plu-stepper__timeline"
          style={{
            '--step-count': String(stepCount),
            '--active-ratio': String(activeIndex / Math.max(stepCount - 1, 1)),
          }}
        >
          {steps.map((step, index) => {
            const num = String(index + 1).padStart(2, '0')
            const isActive = index === activeIndex
            const isPast = index < activeIndex

            return (
              <li key={step.step ?? num} className="members-plu-stepper__timeline-item">
                <button
                  type="button"
                  className={`members-plu-stepper__node${isActive ? ' is-active' : ''}${isPast ? ' is-past' : ''}`}
                  aria-current={isActive ? 'step' : undefined}
                  onClick={() => selectStep(index)}
                >
                  <span className="members-plu-stepper__node-dot" aria-hidden>
                    <span className="members-plu-stepper__node-index">{num}</span>
                  </span>
                  <span className="members-plu-stepper__node-title">{step.title}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
