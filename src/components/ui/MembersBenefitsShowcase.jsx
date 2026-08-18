import { BadgeCheck, CalendarDays, Globe2, QrCode, UserRound } from 'lucide-react'
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
  credential: QrCode,
  profile: UserRound,
  results: BadgeCheck,
  standard: Globe2,
}

const headMotion = {
  hidden: { opacity: 0, x: -10, y: 8 },
  show: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: { duration: MOTION_DURATION.cinematic, ease: MOTION_EASE.out },
  },
}

const ledgerMotion = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: MOTION_STAGGER.step,
      delayChildren: MOTION_STAGGER.delayChildren,
    },
  },
}

const rowMotion = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  },
}

/**
 * Beneficios de afiliación — ledger editorial abierto (sin cards).
 */
export default function MembersBenefitsShowcase({ items = [], title, lead, ariaLabel }) {
  const { t } = useI18n()
  const { reducedMotion } = useMotionConfig()

  if (!items.length) return null

  const head = (
    <MembersBlockHead eyebrow={t('pages.members.benefitsEyebrow')} title={title} lead={lead} />
  )

  return (
    <div className="members-benefits members-benefits--ledger">
      {reducedMotion ? (
        head
      ) : (
        <m.div variants={headMotion} initial="hidden" whileInView="show" viewport={MOTION_VIEWPORT}>
          {head}
        </m.div>
      )}

      <m.ol
        className="members-benefits__ledger"
        aria-label={ariaLabel}
        variants={reducedMotion ? undefined : ledgerMotion}
        initial={reducedMotion ? undefined : 'hidden'}
        whileInView={reducedMotion ? undefined : 'show'}
        viewport={MOTION_VIEWPORT}
      >
        {items.map((item, index) => {
          const Icon = BENEFIT_ICONS[item.id] ?? BadgeCheck
          const num = String(index + 1).padStart(2, '0')

          const content = (
            <>
              <span className="members-benefits__index" aria-hidden>
                {num}
              </span>
              <div className="members-benefits__body">
                <div className="members-benefits__title-row">
                  <span className="members-benefits__icon" aria-hidden>
                    <Icon size={18} strokeWidth={1.5} />
                  </span>
                  <h3 className="members-benefits__label">{item.title}</h3>
                </div>
                <p className="members-benefits__text">{item.text}</p>
              </div>
              <span className="members-benefits__rule" aria-hidden />
            </>
          )

          if (reducedMotion) {
            return (
              <li key={item.id} className="members-benefits__row">
                {content}
              </li>
            )
          }

          return (
            <m.li key={item.id} className="members-benefits__row" variants={rowMotion}>
              {content}
            </m.li>
          )
        })}
      </m.ol>
    </div>
  )
}
