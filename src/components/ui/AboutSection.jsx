import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import { useContent } from '../../hooks/useContent.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { useCssViewTimeline } from '../../motion/useCssViewTimeline.ts'
import TiltCard from '../../motion/TiltCard.tsx'
import { hasFinePointer } from '../../motion/useReducedMotion.ts'
import {
  MOTION_DURATION,
  MOTION_EASE,
  MOTION_STAGGER,
  MOTION_VIEWPORT,
  TILT_MAX_DEG,
} from '../../motion/tokens.ts'

const aboutSequence = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: MOTION_STAGGER.step,
      delayChildren: MOTION_STAGGER.delayChildren,
    },
  },
}

const aboutIntroIn = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.cinematic },
  },
}

const aboutPlateSequence = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: MOTION_STAGGER.step,
      delayChildren: 0.04,
    },
  },
}

const aboutPlateIn3d = {
  hidden: { opacity: 0, y: 16, rotateX: TILT_MAX_DEG },
  visible: {
    opacity: 1,
    y: 0,
    rotateX: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  },
}

const aboutPlateIn2d = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.reveal, ease: MOTION_EASE.out },
  },
}

const aboutLinkIn = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out },
  },
}

export default function AboutSection({ onNavigate }) {
  const { ABOUT_INTRO, ABOUT_PILLARS } = useContent()
  const { reducedMotion, tier } = useMotionConfig()
  const cssViewTimeline = useCssViewTimeline()
  const theaterOff = reducedMotion || tier === 'low'
  const cssTheater = !theaterOff && cssViewTimeline
  const jsTheater = !theaterOff && !cssViewTimeline
  const plateMotion = jsTheater && hasFinePointer() ? aboutPlateIn3d : aboutPlateIn2d
  const lead = ABOUT_INTRO.descriptionLead ?? ABOUT_INTRO.description
  const Root = theaterOff ? 'div' : m.div
  const Header = theaterOff ? 'header' : m.header
  const Link = theaterOff ? 'button' : m.button
  const withVariant = (variants) => (theaterOff ? {} : { variants })
  const rootClass = ['about-section', 'about-section--ledger', cssTheater ? 'about-section--theater' : '']
    .filter(Boolean)
    .join(' ')
  const rootProps = theaterOff
    ? { className: rootClass, 'data-theater': 'off' }
    : {
        className: rootClass,
        'data-theater': cssTheater ? 'css' : 'js',
        variants: aboutSequence,
        initial: 'hidden',
        whileInView: 'visible',
        viewport: { ...MOTION_VIEWPORT, amount: 0.28 },
      }

  return (
    <Root {...rootProps}>
      <div className="about-section__body">
        <Header {...withVariant(aboutIntroIn)} className="about-section__head">
          <div className="about-section__intro">
            <p className="about-section__label">{ABOUT_INTRO.eyebrow}</p>
            <h2 className="about-section__title">
              <span className="about-section__title-line">{ABOUT_INTRO.titleLead}</span>{' '}
              <span className="about-section__title-line about-section__title-line--accent">
                {ABOUT_INTRO.titleAccent}
              </span>
            </h2>
          </div>

          <p className="about-section__desc">{lead}</p>
        </Header>

        {jsTheater ? (
          <m.ul
            className="about-section__plates"
            variants={aboutPlateSequence}
          >
            {ABOUT_PILLARS.map((pillar, index) => (
              <m.li
                key={pillar.id ?? pillar.title}
                className={plateItemClass(pillar.id)}
                variants={plateMotion}
              >
                <AboutPlate pillar={pillar} index={index} />
              </m.li>
            ))}
          </m.ul>
        ) : (
          <ul className="about-section__plates">
            {ABOUT_PILLARS.map((pillar, index) => (
              <li key={pillar.id ?? pillar.title} className={plateItemClass(pillar.id)}>
                <AboutPlate pillar={pillar} index={index} />
              </li>
            ))}
          </ul>
        )}

        {onNavigate ? (
          <Link
            {...withVariant(aboutLinkIn)}
            className="about-section__link motion-icon-shift"
            onClick={() => onNavigate('community')}
            type="button"
          >
            {ABOUT_INTRO.cta}
            <ArrowRight aria-hidden className="motion-icon-shift__target" size={15} />
          </Link>
        ) : null}
      </div>
    </Root>
  )
}

function plateItemClass(id) {
  return ['about-section__plate-item', id === 'standard' ? 'about-section__plate-item--lead' : '']
    .filter(Boolean)
    .join(' ')
}

function AboutPlate({ pillar, index }) {
  return (
    <TiltCard
      className="about-section__plate-tilt"
      innerClassName="tilt-card__inner about-section__plate"
      maxTilt={3}
    >
      <span className="about-section__plate-index" aria-hidden>
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="about-section__plate-copy">
        <h3 className="about-section__plate-title">{pillar.title}</h3>
        {pillar.text ? <p className="about-section__plate-text">{pillar.text}</p> : null}
      </div>
      <span className="about-section__plate-rule" aria-hidden />
    </TiltCard>
  )
}
