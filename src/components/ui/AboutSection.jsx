import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import { useContent } from '../../hooks/useContent.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { useStepBand } from '../../motion/useStepBand.ts'
import {
  MOTION_DURATION,
  MOTION_EASE,
  MOTION_STAGGER,
  MOTION_VIEWPORT,
} from '../../motion/tokens.ts'

/* Manifiesto de tres líneas. Guion de entrada (una sola vez): aparece el
   header, las líneas del título suben una tras otra desde una máscara y cada
   pilar entra con su regla trazándose. Después, el scroll enciende el pilar
   que se está leyendo. */

const aboutSequence = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: MOTION_STAGGER.step * 2,
      delayChildren: MOTION_STAGGER.delayChildren,
    },
  },
}

const aboutHeadIn = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out, staggerChildren: 0.12 },
  },
}

const aboutTitleLineIn = {
  hidden: { y: '108%' },
  visible: {
    y: '0%',
    transition: { duration: MOTION_DURATION.cinematic, ease: MOTION_EASE.cinematic },
  },
}

const aboutRowIn = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  },
}

const aboutRuleIn = {
  hidden: { scaleX: 0 },
  visible: {
    scaleX: 1,
    transition: { duration: 0.9, ease: MOTION_EASE.cinematic },
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

const pad2 = (value) => String(value).padStart(2, '0')

export default function AboutSection({ onNavigate }) {
  const { ABOUT_INTRO, ABOUT_PILLARS } = useContent()
  const { reducedMotion, tier } = useMotionConfig()
  const still = reducedMotion || tier === 'low'
  const { activeIndex, bind } = useStepBand(ABOUT_PILLARS.length, {
    enabled: !still,
    rootMargin: '-34% 0px -34% 0px',
  })
  const lead = ABOUT_INTRO.descriptionLead ?? ABOUT_INTRO.description
  // El acento viene con "\n" para fijar dos líneas doradas: se parten acá para
  // que cada una suba por su propia máscara (y el título lea con espacios).
  const accentLines = String(ABOUT_INTRO.titleAccent ?? '')
    .split('\n')
    .filter(Boolean)

  const Root = still ? 'div' : m.div
  const Head = still ? 'header' : m.header
  const List = still ? 'ul' : m.ul
  const Row = still ? 'li' : m.li
  const Rule = still ? 'span' : m.span
  const Line = still ? 'span' : m.span
  const Link = still ? 'button' : m.button
  const variant = (variants) => (still ? {} : { variants })

  const rootProps = still
    ? {}
    : {
        variants: aboutSequence,
        initial: 'hidden',
        whileInView: 'visible',
        viewport: { ...MOTION_VIEWPORT, amount: 0.22 },
      }

  const titleLines = [
    { text: ABOUT_INTRO.titleLead, accent: false },
    ...accentLines.map((text) => ({ text, accent: true })),
  ]

  return (
    <Root
      className="about-section about-section--ledger"
      data-theater={still ? 'off' : 'js'}
      {...rootProps}
    >
      <Head {...variant(aboutHeadIn)} className="about-section__head">
        <div className="about-section__intro">
          <p className="about-section__label">{ABOUT_INTRO.eyebrow}</p>
          <h2 className="about-section__title">
            {titleLines.map((line, index) => (
              <span key={line.text}>
                {index > 0 ? ' ' : null}
                <span
                  className={`about-section__title-line${line.accent ? ' about-section__title-line--accent' : ''}`}
                >
                  <Line {...variant(aboutTitleLineIn)} className="about-section__title-text">
                    {line.text}
                  </Line>
                </span>
              </span>
            ))}
          </h2>
        </div>

        <p className="about-section__desc">{lead}</p>
      </Head>

      <List className="about-section__plates">
        {ABOUT_PILLARS.map((pillar, index) => (
          <Row
            key={pillar.id ?? pillar.title}
            ref={bind(index)}
            className={plateItemClass(pillar.id)}
            data-active={!still && index === activeIndex ? 'true' : undefined}
            {...variant(aboutRowIn)}
          >
            <Rule {...variant(aboutRuleIn)} className="about-section__rule" aria-hidden />
            <div className="about-section__plate">
              <span className="about-section__plate-index" aria-hidden>
                {pad2(index + 1)}
              </span>
              <h3 className="about-section__plate-title">{pillar.title}</h3>
              {pillar.text ? <p className="about-section__plate-text">{pillar.text}</p> : null}
            </div>
          </Row>
        ))}
      </List>

      {onNavigate ? (
        <Link
          {...variant(aboutLinkIn)}
          className="about-section__link motion-icon-shift"
          onClick={() => onNavigate('community')}
          type="button"
        >
          {ABOUT_INTRO.cta}
          <ArrowRight aria-hidden className="motion-icon-shift__target" size={15} />
        </Link>
      ) : null}
    </Root>
  )
}

function plateItemClass(id) {
  return ['about-section__plate-item', id === 'standard' ? 'about-section__plate-item--lead' : '']
    .filter(Boolean)
    .join(' ')
}
