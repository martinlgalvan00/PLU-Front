import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE } from '../../motion/tokens.ts'

const groupVariants = { hidden: {}, visible: {} }

/** El texto entra antes que el recurso gráfico (podio): la información
 * primero, el detalle visual como remate — nunca al revés. */
const textEyebrow = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out, delay: 0 } },
}
const textTitle = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out, delay: 0.05 } },
}
const textDesc = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out, delay: 0.1 } },
}
/** Barras del podio — suben con scaleY, 60ms de stagger entre ellas. */
const barSilver = {
  hidden: { scaleY: 0 },
  visible: { scaleY: 1, transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out, delay: 0.22 } },
}
const barGold = {
  hidden: { scaleY: 0 },
  visible: { scaleY: 1, transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out, delay: 0.28 } },
}
const barBronze = {
  hidden: { scaleY: 0 },
  visible: { scaleY: 1, transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out, delay: 0.34 } },
}
const baseline = {
  hidden: { scaleX: 0 },
  visible: { scaleX: 1, transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out, delay: 0.4 } },
}
const ctaIn = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out, delay: 0.48 } },
}

export default function HomeResultsTeaser({ onNavigate }) {
  const { HOME_RESULTS } = useContent()
  const { t } = useI18n()
  const { reducedMotion } = useMotionConfig()

  const Group = reducedMotion ? 'article' : m.article
  const Bar = reducedMotion ? 'span' : m.span
  const Eyebrow = reducedMotion ? 'p' : m.p
  const Title = reducedMotion ? 'h2' : m.h2
  const Desc = reducedMotion ? 'p' : m.p
  const Cta = reducedMotion ? 'button' : m.button

  const groupProps = reducedMotion
    ? { className: 'home-teaser-card home-teaser-card--results' }
    : {
        className: 'home-teaser-card home-teaser-card--results',
        variants: groupVariants,
        initial: 'hidden',
        whileInView: 'visible',
        viewport: { once: true, amount: 0.5 },
      }

  const withVariant = (variants) => (reducedMotion ? {} : { variants })

  return (
    <Group {...groupProps}>
      <div className="home-teaser-card__podium" aria-hidden>
        <Bar {...withVariant(barSilver)} className="home-teaser-card__podium-bar home-teaser-card__podium-bar--2" />
        <Bar {...withVariant(barGold)} className="home-teaser-card__podium-bar home-teaser-card__podium-bar--1" />
        <Bar {...withVariant(barBronze)} className="home-teaser-card__podium-bar home-teaser-card__podium-bar--3" />
        <Bar {...withVariant(baseline)} className="home-teaser-card__podium-base" />
      </div>

      <Eyebrow {...withVariant(textEyebrow)} className="home-teaser-card__eyebrow">
        {HOME_RESULTS.eyebrow}
      </Eyebrow>

      <div className="home-teaser-card__body">
        <Title {...withVariant(textTitle)} className="home-teaser-card__title">
          {HOME_RESULTS.title}
        </Title>
        <Desc {...withVariant(textDesc)} className="home-teaser-card__desc">
          {HOME_RESULTS.description}
        </Desc>
      </div>

      <Cta {...withVariant(ctaIn)} type="button" className="home-teaser-card__link" onClick={() => onNavigate('results')}>
        {t('pages.home.viewResults')}
        <ArrowRight size={14} aria-hidden className="home-teaser-card__link-icon" />
      </Cta>
    </Group>
  )
}
