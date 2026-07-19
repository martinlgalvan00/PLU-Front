import { BadgeCheck, CalendarDays, Globe2, Trophy } from 'lucide-react'
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

const BENEFIT_ICONS = {
  events: CalendarDays,
  registry: BadgeCheck,
  results: Trophy,
  standard: Globe2,
}

const headMotion = {
  hidden: { opacity: 0, x: -12, y: 10 },
  show: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: { duration: MOTION_DURATION.cinematic, ease: MOTION_EASE.out },
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
  hidden: (index = 0) => ({
    opacity: 0,
    x: index % 2 === 0 ? -16 : 16,
    y: 24,
  }),
  show: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  },
  hover: {
    y: -6,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out },
  },
}

const iconMotion = {
  hidden: { opacity: 0, rotate: -8, scale: 0.82 },
  show: {
    opacity: 1,
    rotate: 0,
    scale: 1,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.emphasized },
  },
  hover: {
    rotate: 3,
    scale: 1.08,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out },
  },
}

function handleCellPointer(event) {
  const el = event.currentTarget
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--mx', `${(((event.clientX - rect.left) / rect.width) * 100).toFixed(1)}%`)
  el.style.setProperty('--my', `${(((event.clientY - rect.top) / rect.height) * 100).toFixed(1)}%`)
}

export default function MembersBenefitsShowcase({ items = [], title, lead, ariaLabel }) {
  const { t } = useI18n()
  const { reducedMotion } = useMotionConfig()

  if (!items.length) return null

  const head = (
    <MembersBlockHead
      eyebrow={t('pages.members.benefitsEyebrow')}
      title={title}
      lead={lead}
    />
  )

  return (
    <div className="members-benefits">
      {reducedMotion ? (
        head
      ) : (
        <m.div variants={headMotion} initial="hidden" whileInView="show" viewport={MOTION_VIEWPORT}>
          {head}
        </m.div>
      )}

      <m.ol
        className="members-benefits__grid"
        aria-label={ariaLabel}
        variants={reducedMotion ? undefined : gridMotion}
        initial={reducedMotion ? undefined : 'hidden'}
        whileInView={reducedMotion ? undefined : 'show'}
        viewport={MOTION_VIEWPORT}
      >
        {items.map((item, index) => {
          const Icon = BENEFIT_ICONS[item.id] ?? BadgeCheck

          const content = (
            <>
              <span className="members-benefits__ghost" aria-hidden>
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="members-benefits__mark">
                {reducedMotion ? (
                  <span className="members-benefits__icon" aria-hidden>
                    <Icon size={19} strokeWidth={1.5} />
                  </span>
                ) : (
                  <m.span className="members-benefits__icon" aria-hidden variants={iconMotion}>
                    <Icon size={19} strokeWidth={1.5} />
                  </m.span>
                )}
              </div>
              <div className="members-benefits__body">
                <h3 className="members-benefits__label">{item.title}</h3>
                <p className="members-benefits__text">{item.text}</p>
              </div>
            </>
          )

          if (reducedMotion) {
            return (
              <li key={item.id} className="members-benefits__cell">
                {content}
              </li>
            )
          }

          return (
            <m.li
              key={item.id}
              className="members-benefits__cell"
              custom={index}
              variants={cellMotion}
              whileHover="hover"
              onPointerMove={handleCellPointer}
            >
              {content}
            </m.li>
          )
        })}
      </m.ol>
    </div>
  )
}
