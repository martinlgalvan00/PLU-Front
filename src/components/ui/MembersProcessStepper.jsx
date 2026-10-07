import { m } from 'motion/react'
import { CheckCircle2, ClipboardPen, QrCode, WalletCards } from 'lucide-react'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_VIEWPORT } from '../../motion/tokens.ts'
import { staggerContainer, staggerItem } from '../../motion/variants.ts'
import MembersBlockHead from './MembersBlockHead.jsx'

const STEP_ICONS = [ClipboardPen, WalletCards, QrCode, CheckCircle2]

/**
 * Proceso de afiliación — línea de tiempo abierta: todos los pasos visibles a
 * la vez, la regla que los une se dibuja con el scroll (members.css).
 */
export default function MembersProcessStepper({ steps = [], ariaLabel, eyebrow, title, lead }) {
  const { reducedMotion, tier } = useMotionConfig()
  const minimalMotion = reducedMotion || tier === 'low'

  if (!steps.length) return null

  const List = minimalMotion ? 'ol' : m.ol
  const Item = minimalMotion ? 'li' : m.li
  const listMotion = minimalMotion
    ? {}
    : {
        variants: staggerContainer,
        initial: 'hidden',
        whileInView: 'visible',
        viewport: MOTION_VIEWPORT,
      }
  const itemMotion = minimalMotion ? {} : { variants: staggerItem }

  return (
    <div className="members-plu-stepper members-plu-stepper--timeline" aria-label={ariaLabel}>
      <MembersBlockHead eyebrow={eyebrow} title={title} lead={lead} />

      <List
        className="members-plu-stepper__timeline"
        style={{ '--step-count': String(steps.length) }}
        {...listMotion}
      >
        {steps.map((step, index) => {
          const num = String(index + 1).padStart(2, '0')
          const Icon = STEP_ICONS[index % STEP_ICONS.length]
          return (
            <Item
              key={step.step ?? num}
              className="members-plu-stepper__timeline-item"
              {...itemMotion}
            >
              <span className="members-plu-stepper__node-dot" aria-hidden>
                <Icon size={16} strokeWidth={1.6} />
              </span>
              <span className="members-plu-stepper__node-index" aria-hidden>
                {num}
              </span>
              <h3 className="members-plu-stepper__node-title">{step.title}</h3>
              <p className="members-plu-stepper__node-text">{step.text}</p>
            </Item>
          )
        })}
      </List>
    </div>
  )
}
