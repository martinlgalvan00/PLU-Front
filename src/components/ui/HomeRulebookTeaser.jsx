import { ArrowRight, ScrollText } from 'lucide-react'
import { m } from 'motion/react'
import { useContent } from '../../hooks/useContent.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE } from '../../motion/tokens.ts'

/** Entra un beat después de Resultados cuando el duo orquesta. */
const groupVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION_DURATION.slow,
      ease: MOTION_EASE.out,
      when: 'beforeChildren',
      staggerChildren: 0.06,
      delayChildren: 0.04,
    },
  },
}

/** Ritmo más lento y documental que Resultados — nunca compite en velocidad. */
const iconIn = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out },
  },
}

const lineA = {
  hidden: { scaleX: 0, opacity: 0 },
  visible: {
    scaleX: 1,
    opacity: 1,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out, delay: 0.04 },
  },
}
const lineB = {
  hidden: { scaleX: 0, opacity: 0 },
  visible: {
    scaleX: 1,
    opacity: 1,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out, delay: 0.1 },
  },
}
const lineC = {
  hidden: { scaleX: 0, opacity: 0 },
  visible: {
    scaleX: 1,
    opacity: 1,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out, delay: 0.16 },
  },
}

const eyebrowIn = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out },
  },
}
const titleIn = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  },
}
const descIn = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out },
  },
}
const indexIn = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.cinematic },
  },
}
const ctaIn = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out },
  },
}

export default function HomeRulebookTeaser({ onNavigate, orchestrated = false }) {
  const { HOME_RULEBOOK } = useContent()
  const { reducedMotion } = useMotionConfig()

  const Group = reducedMotion ? 'article' : m.article
  const Icon = reducedMotion ? 'div' : m.div
  const Line = reducedMotion ? 'span' : m.span
  const Eyebrow = reducedMotion ? 'p' : m.p
  const Title = reducedMotion ? 'h2' : m.h2
  const Desc = reducedMotion ? 'p' : m.p
  const Index = reducedMotion ? 'ul' : m.ul
  const Cta = reducedMotion ? 'button' : m.button

  const groupProps = reducedMotion
    ? { className: 'home-teaser-card home-teaser-card--rulebook' }
    : {
        className: 'home-teaser-card home-teaser-card--rulebook',
        variants: groupVariants,
        ...(orchestrated
          ? {}
          : {
              initial: 'hidden',
              whileInView: 'visible',
              viewport: { once: true, amount: 0.45 },
            }),
      }

  const withVariant = (variants) => (reducedMotion ? {} : { variants })

  return (
    <Group {...groupProps}>
      <Icon {...withVariant(iconIn)} className="home-teaser-card__doc-icon" aria-hidden>
        <ScrollText size={15} strokeWidth={1.75} />
        <span className="home-teaser-card__doc-lines">
          <Line {...withVariant(lineA)} />
          <Line {...withVariant(lineB)} />
          <Line {...withVariant(lineC)} />
        </span>
      </Icon>

      <Eyebrow {...withVariant(eyebrowIn)} className="home-teaser-card__eyebrow">
        {HOME_RULEBOOK.eyebrow}
      </Eyebrow>

      <div className="home-teaser-card__body">
        <Title {...withVariant(titleIn)} className="home-teaser-card__title">
          {HOME_RULEBOOK.title}
        </Title>
        <Desc {...withVariant(descIn)} className="home-teaser-card__desc">
          {HOME_RULEBOOK.description}
        </Desc>
      </div>

      {HOME_RULEBOOK.topics?.length ? (
        <Index
          {...withVariant(indexIn)}
          className="home-teaser-card__rulebook-index"
          aria-label={HOME_RULEBOOK.title}
        >
          {HOME_RULEBOOK.topics.map((topic) => (
            <li key={topic} className="home-teaser-card__rulebook-item">
              <span>{topic}</span>
              <span className="home-teaser-card__rulebook-line" aria-hidden />
            </li>
          ))}
        </Index>
      ) : null}

      <Cta
        {...withVariant(ctaIn)}
        type="button"
        className="home-teaser-card__link"
        onClick={() => onNavigate('rulebook')}
      >
        {HOME_RULEBOOK.cta}
        <ArrowRight size={14} aria-hidden className="home-teaser-card__link-icon" />
      </Cta>
    </Group>
  )
}
