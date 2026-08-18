import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import { useContent } from '../../hooks/useContent.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import {
  MOTION_DURATION,
  MOTION_EASE,
  MOTION_STAGGER,
  MOTION_VIEWPORT,
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

const aboutPillarSequence = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: MOTION_STAGGER.step,
      delayChildren: 0.04,
    },
  },
}

const aboutPillarIn = {
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
  const { reducedMotion } = useMotionConfig()
  const lead = ABOUT_INTRO.descriptionLead ?? ABOUT_INTRO.description
  const meta = ABOUT_INTRO.descriptionMeta
  const Root = reducedMotion ? 'div' : m.div
  const Header = reducedMotion ? 'header' : m.header
  const PillarList = reducedMotion ? 'ul' : m.ul
  const Pillar = reducedMotion ? 'li' : m.li
  const Link = reducedMotion ? 'button' : m.button
  const withVariant = (variants) => (reducedMotion ? {} : { variants })
  const rootProps = reducedMotion
    ? { className: 'about-section' }
    : {
        className: 'about-section',
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

          <div className="about-section__copy">
            <p className="about-section__desc">{lead}</p>
            {meta ? <p className="about-section__meta">{meta}</p> : null}
          </div>
        </Header>

        <PillarList {...withVariant(aboutPillarSequence)} className="about-section__pillars">
          {ABOUT_PILLARS.map(({ id, title, text }, index) => (
            <Pillar
              {...withVariant(aboutPillarIn)}
              key={id ?? title}
              className="about-section__pillar"
            >
              <span className="about-section__pillar-index" aria-hidden>
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="about-section__pillar-title">{title}</h3>
              <p className="about-section__pillar-text">{text}</p>
            </Pillar>
          ))}
        </PillarList>

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
