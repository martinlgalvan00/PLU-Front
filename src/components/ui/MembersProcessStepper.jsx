import { m } from 'motion/react'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import {
  MOTION_DURATION,
  MOTION_EASE,
  MOTION_STAGGER,
  MOTION_VIEWPORT,
} from '../../motion/tokens.ts'
import MembersBlockHead from './MembersBlockHead.jsx'

const railContainer = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: MOTION_STAGGER.step,
      delayChildren: 0.16,
    },
  },
}

const itemVariant = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION_DURATION.slow,
      ease: MOTION_EASE.out,
    },
  },
}

const indexVariant = {
  hidden: { opacity: 0, scale: 0.6 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: MOTION_DURATION.base,
      ease: MOTION_EASE.out,
    },
  },
}

/**
 * Proceso de afiliación — timeline editorial con entrada stagger.
 * Los pasos se ven de una: sin carrusel ni autoplay.
 */
export default function MembersProcessStepper({
  steps = [],
  ariaLabel,
  eyebrow,
  title,
  lead,
}) {
  const { reducedMotion } = useMotionConfig()
  const stepCount = Math.max(steps.length, 1)

  return (
    <div className="members-plu-stepper" aria-label={ariaLabel}>
      <MembersBlockHead eyebrow={eyebrow} title={title} lead={lead} />

      {reducedMotion ? (
        <ol className="members-plu-stepper__rail" style={{ '--step-count': String(stepCount) }}>
          {steps.map((step, index) => {
            const num = String(index + 1).padStart(2, '0')
            return (
              <li key={step.step ?? num} className="members-plu-stepper__item">
                <span className="members-plu-stepper__index" aria-hidden>
                  {num}
                </span>
                <div className="members-plu-stepper__copy">
                  <h3 className="members-plu-stepper__item-title">{step.title}</h3>
                  <p className="members-plu-stepper__item-text">{step.text}</p>
                </div>
              </li>
            )
          })}
        </ol>
      ) : (
        <div className="members-plu-stepper__track">
          <m.span
            className="members-plu-stepper__line"
            aria-hidden
            initial={{ scaleX: 0, opacity: 0 }}
            whileInView={{ scaleX: 1, opacity: 1 }}
            viewport={{ once: MOTION_VIEWPORT.once, amount: 0.35 }}
            transition={{
              duration: MOTION_DURATION.cinematic,
              ease: MOTION_EASE.emphasized,
            }}
            style={{ transformOrigin: 'left center' }}
          />
          <m.ol
            className="members-plu-stepper__rail members-plu-stepper__rail--motion"
            style={{ '--step-count': String(stepCount) }}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: MOTION_VIEWPORT.once, amount: 0.28 }}
            variants={railContainer}
          >
            {steps.map((step, index) => {
              const num = String(index + 1).padStart(2, '0')
              return (
                <m.li
                  key={step.step ?? num}
                  className="members-plu-stepper__item"
                  variants={itemVariant}
                >
                  <m.span
                    className="members-plu-stepper__index"
                    aria-hidden
                    variants={indexVariant}
                  >
                    {num}
                  </m.span>
                  <div className="members-plu-stepper__copy">
                    <h3 className="members-plu-stepper__item-title">{step.title}</h3>
                    <p className="members-plu-stepper__item-text">{step.text}</p>
                  </div>
                </m.li>
              )
            })}
          </m.ol>
        </div>
      )}
    </div>
  )
}
