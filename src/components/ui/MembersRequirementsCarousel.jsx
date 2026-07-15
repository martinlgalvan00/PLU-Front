import { Camera, HeartPulse, IdCard, UserRound } from 'lucide-react'
import { m } from 'motion/react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import {
  MOTION_DURATION,
  MOTION_EASE,
  MOTION_STAGGER,
  MOTION_VIEWPORT,
} from '../../motion/tokens.ts'
import MembersBlockHead from './MembersBlockHead.jsx'

const REQUIREMENT_ICONS = {
  id: IdCard,
  age: UserRound,
  health: HeartPulse,
  photo: Camera,
}

const headMotion = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  },
}

const gridMotion = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: MOTION_STAGGER.step,
      delayChildren: MOTION_STAGGER.delayChildren,
    },
  },
}

const cellMotion = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  },
}

export default function MembersRequirementsCarousel({
  items = [],
  ariaLabel,
  title,
  lead,
}) {
  const { t } = useI18n()
  const { reducedMotion } = useMotionConfig()

  if (!items.length) return null

  const head = (
    <MembersBlockHead
      eyebrow={t('pages.members.requirementsEyebrow')}
      title={title}
      lead={lead}
    />
  )

  return (
    <div className="members-req">
      {reducedMotion ? (
        head
      ) : (
        <m.div variants={headMotion} initial="hidden" whileInView="show" viewport={MOTION_VIEWPORT}>
          {head}
        </m.div>
      )}

      <m.ol
        className="members-req__board"
        aria-label={ariaLabel}
        variants={reducedMotion ? undefined : gridMotion}
        initial={reducedMotion ? undefined : 'hidden'}
        whileInView={reducedMotion ? undefined : 'show'}
        viewport={MOTION_VIEWPORT}
      >
        {items.map((item, index) => {
          const Icon = REQUIREMENT_ICONS[item.id] ?? IdCard

          const content = (
            <>
              <div className="members-req__mark">
                <span className="members-req__index" aria-hidden>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="members-req__icon" aria-hidden>
                  <Icon size={16} strokeWidth={1.4} />
                </span>
              </div>
              <div className="members-req__body">
                <h3 className="members-req__label">{item.title}</h3>
                <p className="members-req__text">{item.text}</p>
              </div>
            </>
          )

          if (reducedMotion) {
            return (
              <li key={item.id} className="members-req__cell">
                {content}
              </li>
            )
          }

          return (
            <m.li key={item.id} className="members-req__cell" variants={cellMotion}>
              {content}
            </m.li>
          )
        })}
      </m.ol>
    </div>
  )
}
