import { useRef } from 'react'
import { ArrowRight, Check, QrCode } from 'lucide-react'
import { m, useScroll, useTransform } from 'motion/react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import Reveal from '../../motion/Reveal.tsx'
import ScrollRail from '../../motion/ScrollRail.tsx'
import { MOTION_TIER_SCALE, TILT_MAX_DEG } from '../../motion/tokens.ts'
import { hasFinePointer } from '../../motion/useReducedMotion.ts'
import { useMinWidth } from '../../motion/useMinWidth.ts'
import { useStepBand } from '../../motion/useStepBand.ts'
import '../../styles/components/scroll-rail.css'
import '../../styles/components/home-journey.css'

/** Perspectiva de la credencial: la misma que usa el settle de la banda de afiliación. */
const PASS_PERSPECTIVE = 1200

/** Ancho desde el cual el escenario queda fijo junto a los capítulos. */
const STAGE_MIN_WIDTH = 900

const pad2 = (value) => String(value).padStart(2, '0')

/**
 * Los tres capítulos desarrollan la frase del hero ("Afiliate. Competí.
 * Resultados oficiales."). Cada uno enciende su fila en la credencial: son
 * los tres derechos que el QR único resuelve (afiliación, inscripción, resultados).
 */
const CHAPTERS = [
  { id: 'membership', n: 1, view: 'members', ctaKey: 'pages.home.journeyStep1Cta' },
  { id: 'registration', n: 2, view: 'events', ctaKey: 'pages.home.viewCalendar' },
  { id: 'results', n: 3, view: 'results', ctaKey: 'pages.home.viewResults' },
]

const PASS_ROW_KEYS = {
  membership: 'pages.home.journeyPassMembership',
  registration: 'pages.home.journeyPassRegistration',
  results: 'pages.home.journeyPassResults',
}

function rowState(index, activeIndex, still) {
  if (still || index < activeIndex) return 'done'
  return index === activeIndex ? 'active' : 'idle'
}

/**
 * Credencial del escenario. Es la única pieza con profundidad de la sección:
 * rota unos grados ligada al scroll (solo `transform`) y solo con puntero fino
 * y tier no bajo. El resto del tiempo queda plana.
 */
function JourneyPass({ targetRef, activeIndex, still, t }) {
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ['start 85%', 'end 15%'],
  })
  const { tier } = useMotionConfig()
  const maxTilt = TILT_MAX_DEG * MOTION_TIER_SCALE[tier]
  const rotateY = useTransform(scrollYProgress, [0, 1], [maxTilt, -maxTilt])
  const depth = !still && hasFinePointer()

  const Shell = depth ? m.div : 'div'
  const shellProps = depth ? { style: { rotateY, transformPerspective: PASS_PERSPECTIVE } } : {}

  return (
    <Shell className="journey-pass" {...shellProps}>
      <div className="journey-pass__head">
        <span className="journey-pass__mono">PLU</span>
        <span className="journey-pass__title">{t('pages.home.journeyPassTitle')}</span>
      </div>
      <div className="journey-pass__body">
        <span className="journey-pass__qr">
          <QrCode size={64} strokeWidth={1.25} />
        </span>
        <ul className="journey-pass__rows">
          {CHAPTERS.map((chapter, index) => (
            <li
              key={chapter.id}
              className="journey-pass__row"
              data-state={rowState(index, activeIndex, still)}
            >
              <span className="journey-pass__mark">
                <Check size={11} strokeWidth={3} />
              </span>
              <span className="journey-pass__label">{t(PASS_ROW_KEYS[chapter.id])}</span>
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  )
}

/**
 * Recorrido del atleta contado como historia: tres capítulos que se leen con
 * el scroll mientras una credencial QR fija, al costado, va encendiendo cada
 * derecho. El texto nunca se atenúa; lo que cambia es el riel, el marcador y la
 * credencial. Solo transform / opacity, sin loops.
 *
 * Reduced motion / tier low / mobile: lista de capítulos con riel; sin
 * rotación. En reduced motion y tier low la credencial queda en su estado final.
 */
export default function HomeAthleteJourney({ onNavigate }) {
  const { t } = useI18n()
  const { reducedMotion, tier } = useMotionConfig()
  const still = reducedMotion || tier === 'low'
  const wide = useMinWidth(STAGE_MIN_WIDTH)
  const listRef = useRef(null)
  const { activeIndex, bind } = useStepBand(CHAPTERS.length, { enabled: !still })

  return (
    <div className="home-journey" data-stage={wide ? 'true' : undefined}>
      <Reveal as="header" className="home-journey__head" direction="up">
        <p className="home-journey__eyebrow">{t('pages.home.journeyEyebrow')}</p>
        <h2 className="home-journey__title" id="home-journey-title">
          {t('pages.home.journeyTitle')}
        </h2>
        <p className="home-journey__lead">{t('pages.home.journeyLead')}</p>
      </Reveal>

      <div className="home-journey__body">
        <div className="home-journey__track" ref={listRef}>
          <ScrollRail targetRef={listRef} className="home-journey__rail" />
          <ol className="home-journey__steps" aria-label={t('pages.home.journeyAria')}>
            {CHAPTERS.map((chapter, index) => {
              const state = rowState(index, activeIndex, still)
              return (
                <li
                  key={chapter.id}
                  ref={still ? undefined : bind(index)}
                  className="home-journey__step"
                  data-state={state}
                  aria-current={!still && state === 'active' ? 'step' : undefined}
                >
                  <span className="step-dot home-journey__dot" data-state={state} aria-hidden />
                  <span className="home-journey__index" aria-hidden>
                    {pad2(chapter.n)}
                  </span>
                  <h3 className="home-journey__step-title">
                    {t(`pages.home.journeyStep${chapter.n}Title`)}
                  </h3>
                  <p className="home-journey__step-text">
                    {t(`pages.home.journeyStep${chapter.n}Text`)}
                  </p>
                  {onNavigate ? (
                    <button
                      type="button"
                      className="home-journey__link motion-icon-shift"
                      onClick={() => onNavigate(chapter.view)}
                    >
                      {t(chapter.ctaKey)}
                      <ArrowRight aria-hidden className="motion-icon-shift__target" size={15} />
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ol>
        </div>

        {wide ? (
          <div className="home-journey__stage" aria-hidden>
            <JourneyPass targetRef={listRef} activeIndex={activeIndex} still={still} t={t} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
