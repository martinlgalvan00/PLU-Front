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
  hidden: { opacity: 0, y: 14 },
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
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  },
}

const iconMotion = {
  hidden: { opacity: 0, scale: 0.88 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.emphasized },
  },
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
              <div className="members-benefits__mark">
                {reducedMotion ? (
                  <span className="members-benefits__icon" aria-hidden>
                    <Icon size={18} strokeWidth={1.5} />
                  </span>
                ) : (
                  <m.span className="members-benefits__icon" aria-hidden variants={iconMotion}>
                    <Icon size={18} strokeWidth={1.5} />
                  </m.span>
                )}
                <span className="members-benefits__index" aria-hidden>
                  {String(index + 1).padStart(2, '0')}
                </span>
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
              variants={cellMotion}
              whileHover={{ y: -3 }}
              transition={{ duration: MOTION_DURATION.fast, ease: MOTION_EASE.out }}
            >
              {content}
            </m.li>
          )
        })}
      </m.ol>
    </div>
  )
}
