import { ArrowRight, ScrollText } from 'lucide-react'
import { m } from 'motion/react'
import { useContent } from '../../hooks/useContent.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE } from '../../motion/tokens.ts'

const groupVariants = { hidden: {}, visible: {} }

/** Ritmo más lento y documental que Resultados — nunca compite en velocidad,
 * es reglamento, no un dato dinámico. */
const lineA = { hidden: { scaleX: 0 }, visible: { scaleX: 1, transition: { duration: 0.3, ease: MOTION_EASE.out, delay: 0 } } }
const lineB = { hidden: { scaleX: 0 }, visible: { scaleX: 1, transition: { duration: 0.3, ease: MOTION_EASE.out, delay: 0.06 } } }
const lineC = { hidden: { scaleX: 0 }, visible: { scaleX: 1, transition: { duration: 0.3, ease: MOTION_EASE.out, delay: 0.12 } } }
const eyebrowIn = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out, delay: 0.22 } },
}
const titleIn = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out, delay: 0.3 } },
}
const ctaIn = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out, delay: 0.56 } },
}

export default function HomeRulebookTeaser({ onNavigate }) {
  const { HOME_RULEBOOK } = useContent()
  const { reducedMotion } = useMotionConfig()

  const Group = reducedMotion ? 'article' : m.article
  const Line = reducedMotion ? 'span' : m.span
  const Eyebrow = reducedMotion ? 'p' : m.p
  const Title = reducedMotion ? 'h2' : m.h2
  const Cta = reducedMotion ? 'button' : m.button

  const groupProps = reducedMotion
    ? { className: 'home-teaser-card home-teaser-card--rulebook' }
    : {
        className: 'home-teaser-card home-teaser-card--rulebook',
        variants: groupVariants,
        initial: 'hidden',
        whileInView: 'visible',
        viewport: { once: true, amount: 0.5 },
      }

  const withVariant = (variants) => (reducedMotion ? {} : { variants })

  return (
    <Group {...groupProps}>
      <div className="home-teaser-card__doc-icon" aria-hidden>
        <ScrollText size={15} strokeWidth={1.75} />
        <span className="home-teaser-card__doc-lines">
          <Line {...withVariant(lineA)} />
          <Line {...withVariant(lineB)} />
          <Line {...withVariant(lineC)} />
        </span>
      </div>

      <Eyebrow {...withVariant(eyebrowIn)} className="home-teaser-card__eyebrow">
        {HOME_RULEBOOK.eyebrow}
      </Eyebrow>

      <div className="home-teaser-card__body">
        <Title {...withVariant(titleIn)} className="home-teaser-card__title">
          {HOME_RULEBOOK.title}
        </Title>
      </div>

      <Cta {...withVariant(ctaIn)} type="button" className="home-teaser-card__link" onClick={() => onNavigate('rulebook')}>
        {HOME_RULEBOOK.cta}
        <ArrowRight size={14} aria-hidden className="home-teaser-card__link-icon" />
      </Cta>
    </Group>
  )
}
