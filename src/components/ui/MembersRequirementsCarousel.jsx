import { Camera, HeartPulse, IdCard, UserRound } from 'lucide-react'
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

const REQUIREMENT_ICONS = {
  id: IdCard,
  age: UserRound,
  health: HeartPulse,
  photo: Camera,
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

const gridMotion = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: MOTION_STAGGER.step,
      delayChildren: MOTION_STAGGER.delayChildren,
    },
  },
}

const cellMotion3d = {
  hidden: (index = 0) => ({
    opacity: 0,
    y: 14,
    rotateY: index % 2 === 0 ? -TILT_MAX_DEG : TILT_MAX_DEG,
  }),
  show: {
    opacity: 1,
    y: 0,
    rotateY: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  },
}

const cellMotion2d = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  },
}

function handlePlatePointer(event) {
  const el = event.currentTarget
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--mx', `${(((event.clientX - rect.left) / rect.width) * 100).toFixed(1)}%`)
  el.style.setProperty('--my', `${(((event.clientY - rect.top) / rect.height) * 100).toFixed(1)}%`)
}

export default function MembersRequirementsCarousel({ items = [], ariaLabel, title, lead }) {
  const { t } = useI18n()
  const { reducedMotion, tier } = useMotionConfig()
  const cssViewTimeline = useCssViewTimeline()
  const theaterOff = reducedMotion || tier === 'low'
  const cssTheater = !theaterOff && cssViewTimeline
  const jsTheater = !theaterOff && !cssViewTimeline
  const allow3d = jsTheater && hasFinePointer()
  const cellMotion = allow3d ? cellMotion3d : cellMotion2d
  const glareEnabled = !theaterOff && hasFinePointer()

  if (!items.length) return null

  const head = (
    <MembersBlockHead eyebrow={t('pages.members.requirementsEyebrow')} title={title} lead={lead} />
  )

  const rootClass = ['members-req', cssTheater ? 'members-req--theater' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={rootClass} data-theater={theaterOff ? 'off' : cssTheater ? 'css' : 'js'}>
      {theaterOff ? (
        head
      ) : (
        <m.div variants={headMotion} initial="hidden" whileInView="show" viewport={MOTION_VIEWPORT}>
          {head}
        </m.div>
      )}

      {jsTheater ? (
        <m.ol
          className="members-req__board"
          aria-label={ariaLabel}
          variants={gridMotion}
          initial="hidden"
          whileInView="show"
          viewport={MOTION_VIEWPORT}
        >
          {items.map((item, index) => (
            <m.li
              key={item.id}
              className="members-req__cell"
              custom={index}
              variants={cellMotion}
            >
              <RequirementPlate item={item} index={index} glareEnabled={glareEnabled} />
            </m.li>
          ))}
        </m.ol>
      ) : (
        <ol className="members-req__board" aria-label={ariaLabel}>
          {items.map((item, index) => (
            <li key={item.id} className="members-req__cell">
              <RequirementPlate item={item} index={index} glareEnabled={glareEnabled} />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function RequirementPlate({ item, index, glareEnabled }) {
  const Icon = REQUIREMENT_ICONS[item.id] ?? IdCard

  return (
    <div
      className="members-req__plate"
      onPointerMove={glareEnabled ? handlePlatePointer : undefined}
    >
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
    </div>
  )
}
