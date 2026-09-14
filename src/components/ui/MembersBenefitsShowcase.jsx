import { BadgeCheck, CalendarDays, Globe2, QrCode, UserRound } from 'lucide-react'
import { m } from 'motion/react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { useCssViewTimeline } from '../../motion/useCssViewTimeline.ts'
import { hasFinePointer } from '../../motion/useReducedMotion.ts'
import {
  MOTION_DURATION,
  MOTION_EASE,
  MOTION_STAGGER,
  MOTION_VIEWPORT,
  TILT_MAX_DEG,
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

const rowMotion3d = {
  hidden: { opacity: 0, y: 16, rotateX: TILT_MAX_DEG },
  show: {
    opacity: 1,
    y: 0,
    rotateX: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  },
}

const rowMotion2d = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  },
}

/**
 * Beneficios de afiliación — ledger editorial abierto (sin cards).
 * Teatro 3D: pitch (rotateX) ligado al scroll cuando el browser lo soporta.
 */
export default function MembersBenefitsShowcase({ items = [], title, lead, ariaLabel }) {
  const { t } = useI18n()
  const { reducedMotion, tier } = useMotionConfig()
  const cssViewTimeline = useCssViewTimeline()
  const theaterOff = reducedMotion || tier === 'low'
  const cssTheater = !theaterOff && cssViewTimeline
  const jsTheater = !theaterOff && !cssViewTimeline
  const rowMotion = jsTheater && hasFinePointer() ? rowMotion3d : rowMotion2d

  if (!items.length) return null

  const head = (
    <MembersBlockHead eyebrow={t('pages.members.benefitsEyebrow')} title={title} lead={lead} />
  )

  const rootClass = [
    'members-benefits',
    'members-benefits--ledger',
    cssTheater ? 'members-benefits--theater' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={rootClass}
      data-theater={theaterOff ? 'off' : cssTheater ? 'css' : 'js'}
    >
      {theaterOff ? (
        <div className="members-benefits__head">{head}</div>
      ) : (
        <m.div
          className="members-benefits__head"
          variants={headMotion}
          initial="hidden"
          whileInView="show"
          viewport={MOTION_VIEWPORT}
        >
          {head}
        </m.div>
      )}

      {jsTheater ? (
        <m.ol
          className="members-benefits__ledger"
          aria-label={ariaLabel}
          variants={ledgerMotion}
          initial="hidden"
          whileInView="show"
          viewport={MOTION_VIEWPORT}
        >
          {items.map((item, index) => (
            <m.li
              key={item.id}
              className={benefitRowClass(item.id)}
              variants={rowMotion}
            >
              <BenefitRow item={item} index={index} />
            </m.li>
          ))}
        </m.ol>
      ) : (
        <ol className="members-benefits__ledger" aria-label={ariaLabel}>
          {items.map((item, index) => (
            <li key={item.id} className={benefitRowClass(item.id)}>
              <BenefitRow item={item} index={index} />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function benefitRowClass(id) {
  return ['members-benefits__row', id === 'credential' ? 'members-benefits__row--lead' : '']
    .filter(Boolean)
    .join(' ')
}

function BenefitRow({ item, index }) {
  const Icon = BENEFIT_ICONS[item.id] ?? BadgeCheck
  const num = String(index + 1).padStart(2, '0')

  return (
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
}
