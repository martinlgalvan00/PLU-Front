import { m } from 'motion/react'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE, MOTION_VIEWPORT } from '../../motion/tokens.ts'
import MembersBlockHead from './MembersBlockHead.jsx'

/**
 * Proceso de afiliación — timeline editorial.
 * Los 4 pasos se ven de una: sin carrusel ni autoplay.
 */
export default function MembersProcessStepper({
  steps = [],
  ariaLabel,
  eyebrow,
  title,
  lead,
}) {
  const { reducedMotion } = useMotionConfig()

  return (
    <div className="members-plu-stepper" aria-label={ariaLabel}>
      <MembersBlockHead eyebrow={eyebrow} title={title} lead={lead} />

      <ol className="members-plu-stepper__rail">
        {steps.map((step, index) => {
          const num = String(index + 1).padStart(2, '0')
          const content = (
            <>
              <span className="members-plu-stepper__index" aria-hidden>
                {num}
              </span>
              <div className="members-plu-stepper__copy">
                <h3 className="members-plu-stepper__item-title">{step.title}</h3>
                <p className="members-plu-stepper__item-text">{step.text}</p>
              </div>
            </>
          )

          if (reducedMotion) {
            return (
              <li key={step.step ?? num} className="members-plu-stepper__item">
                {content}
              </li>
            )
          }

          return (
            <m.li
              key={step.step ?? num}
              className="members-plu-stepper__item"
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: MOTION_VIEWPORT.once, amount: 0.25 }}
              transition={{
                duration: MOTION_DURATION.slow,
                ease: MOTION_EASE.out,
                delay: index * 0.08,
              }}
            >
              {content}
            </m.li>
          )
        })}
      </ol>
    </div>
  )
}
