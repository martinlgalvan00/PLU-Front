import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE } from '../../motion/tokens.ts'

const groupVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION_DURATION.slow,
      ease: MOTION_EASE.cinematic,
      when: 'beforeChildren',
      staggerChildren: 0.055,
      delayChildren: 0.02,
    },
  },
}

const fadeUp = (delay = 0) => ({
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out, delay },
  },
})

/** Badge de estado: settle one-shot (no loop) — comunica “Pendiente”. */
const statusVariants = {
  hidden: { opacity: 0, scale: 0.92, y: 4 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.spring },
  },
}

const sheetVariants = {
  hidden: {
    opacity: 0,
    y: 16,
    scale: 0.985,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: MOTION_DURATION.slow,
      ease: MOTION_EASE.cinematic,
      when: 'beforeChildren',
      staggerChildren: 0.07,
      delayChildren: 0.08,
    },
  },
}

const sheetRuleVariants = {
  hidden: { scaleX: 0, opacity: 0 },
  visible: {
    scaleX: 1,
    opacity: 1,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.cinematic },
  },
}

const sheetMetaVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out },
  },
}

const ledgerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.065,
      delayChildren: 0.06,
    },
  },
}

const rowVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: MOTION_DURATION.base,
      ease: MOTION_EASE.out,
      when: 'beforeChildren',
      staggerChildren: 0.04,
    },
  },
}

const ghostVariants = {
  hidden: { scaleX: 0, opacity: 0 },
  visible: {
    scaleX: 1,
    opacity: 1,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.cinematic },
  },
}

const ctaVariants = fadeUp(0)

/** Filas ghost: categoría real, total aún no publicado (barra de distinto largo). */
const GHOST_ROWS = [
  { place: '01', classKey: 'open83', tone: 'gold', fill: 'full' },
  { place: '02', classKey: 'open74', tone: 'silver', fill: 'mid' },
  { place: '03', classKey: 'women63', tone: 'bronze', fill: 'short' },
]

/**
 * Teaser de resultados — empty state editorial (sin inventar rankings).
 * Planilla de exportación ghost: evento · categorías · totales pendientes.
 *
 * `orchestrated`: el padre (.home-teaser-duo) dispara whileInView; acá solo
 * respondemos con variants para que Resultados entre antes que Reglamento.
 */
export default function HomeResultsTeaser({ onNavigate, orchestrated = false }) {
  const { HOME_RESULTS } = useContent()
  const { t } = useI18n()
  const { reducedMotion } = useMotionConfig()

  const Group = reducedMotion ? 'article' : m.article
  const Eyebrow = reducedMotion ? 'p' : m.p
  const Status = reducedMotion ? 'span' : m.span
  const Title = reducedMotion ? 'h2' : m.h2
  const Desc = reducedMotion ? 'p' : m.p
  const Sheet = reducedMotion ? 'div' : m.div
  const Rule = reducedMotion ? 'span' : m.span
  const Meta = reducedMotion ? 'div' : m.div
  const Ledger = reducedMotion ? 'div' : m.div
  const Row = reducedMotion ? 'div' : m.div
  const Ghost = reducedMotion ? 'span' : m.span
  const Cta = reducedMotion ? 'button' : m.button

  const groupProps = reducedMotion
    ? { className: 'home-teaser-card home-teaser-card--results' }
    : {
        className: 'home-teaser-card home-teaser-card--results',
        variants: groupVariants,
        ...(orchestrated
          ? {}
          : {
              initial: 'hidden',
              whileInView: 'visible',
              viewport: { once: true, amount: 0.35 },
            }),
      }

  const withVariant = (variants) => (reducedMotion ? {} : { variants })

  return (
    <Group {...groupProps}>
      <div className="home-teaser-card__head">
        <Eyebrow {...withVariant(fadeUp())} className="home-teaser-card__eyebrow">
          {HOME_RESULTS.eyebrow}
        </Eyebrow>
        <Status {...withVariant(statusVariants)} className="home-teaser-card__status">
          {HOME_RESULTS.status}
        </Status>
      </div>

      <div className="home-teaser-card__body">
        <Title {...withVariant(fadeUp())} className="home-teaser-card__title">
          {HOME_RESULTS.title}
        </Title>
        <Desc {...withVariant(fadeUp())} className="home-teaser-card__desc">
          {HOME_RESULTS.description}
        </Desc>
      </div>

      <Sheet {...withVariant(sheetVariants)} className="home-teaser-card__sheet" aria-hidden>
        <Rule {...withVariant(sheetRuleVariants)} className="home-teaser-card__sheet-rule" />

        <Meta {...withVariant(sheetMetaVariants)} className="home-teaser-card__sheet-meta">
          <span className="home-teaser-card__sheet-event">{HOME_RESULTS.metaEvent}</span>
          <span className="home-teaser-card__sheet-export">{HOME_RESULTS.metaExport}</span>
        </Meta>

        <Ledger {...withVariant(ledgerVariants)} className="home-teaser-card__ledger">
          {GHOST_ROWS.map((row) => (
            <Row
              key={row.place}
              {...withVariant(rowVariants)}
              className={`home-teaser-card__ledger-row home-teaser-card__ledger-row--${row.tone}`}
            >
              <span className="home-teaser-card__ledger-place">{row.place}</span>
              <span className="home-teaser-card__ledger-class">{HOME_RESULTS.classes[row.classKey]}</span>
              <Ghost
                {...withVariant(ghostVariants)}
                className={`home-teaser-card__ledger-ghost home-teaser-card__ledger-ghost--${row.fill}`}
              />
            </Row>
          ))}
        </Ledger>
      </Sheet>

      <Cta
        {...withVariant(ctaVariants)}
        type="button"
        className="home-teaser-card__link"
        onClick={() => onNavigate('results')}
      >
        {t('pages.home.viewResults')}
        <ArrowRight size={14} aria-hidden className="home-teaser-card__link-icon" />
      </Cta>
    </Group>
  )
}
