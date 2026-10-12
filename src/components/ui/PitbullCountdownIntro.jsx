import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m } from 'motion/react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getEventCountdownHeadline, resolveEventStartsAt } from '../../lib/countdown.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import TickNumber from '../../motion/TickNumber.tsx'
import { MOTION_DURATION, MOTION_EASE } from '../../motion/tokens.ts'
import '../../styles/components/meet-surface.css'
import '../../styles/components/pitbull-countdown-intro.css'
import { BARBELL_MAX_PLATES, getBarbellTimeline } from '../../lib/barbellTimeline.js'
import BarbellLoad from './BarbellLoad.jsx'

const SEEN_KEY = 'plu.pitbull.countdownIntro'
/** No se repite si el atleta vuelve a Pitbull dentro de esta ventana. */
const REPLAY_AFTER_MS = 10 * 60 * 1000
/** El valor se recalcula cada tanto: una semana que se cumple cambia el titular. */
const REFRESH_MS = 30_000

/** Guion de la secuencia (segundos, a velocidad completa). Cada tramo arranca
 * cuando termina el anterior: título → eje → discos que suman el número →
 * tope que ajusta y unidad → barra asentada → pausa → la cortina se levanta. */
const SCRIPT = {
  eyebrow: 0.3,
  shaft: 0.55,
  lead: 1,
  plates: 1.5,
  stepMax: 0.32,
  platesTotalMax: 2.4,
  hold: 0.9,
}

const TIER_SCALE = { high: 1, mid: 0.72 }
const STILL_HOLD_MS = 1600

function wasSeenRecently() {
  try {
    const raw = window.sessionStorage.getItem(SEEN_KEY)
    const seenAt = raw ? Number(raw) : 0
    return Number.isFinite(seenAt) && Date.now() - seenAt < REPLAY_AFTER_MS
  } catch {
    return false
  }
}

function markSeen() {
  try {
    window.sessionStorage.setItem(SEEN_KEY, String(Date.now()))
  } catch {
    /* sessionStorage bloqueado: la pantalla simplemente puede repetirse */
  }
}

/** Calcula los tiempos de la secuencia para un valor y un tier dados. */
function buildTimeline(value, tier) {
  const scale = TIER_SCALE[tier] ?? 1
  const plates = Math.max(1, Math.min(value, BARBELL_MAX_PLATES))
  const step = Math.min(SCRIPT.stepMax, SCRIPT.platesTotalMax / plates) * scale
  const platesAt = SCRIPT.plates * scale
  // La barra no escala con el tier: su guion es fijo. Los hitos del tope salen
  // de ella para que la unidad aparezca cuando el tope ajusta y la cortina no
  // se levante antes de que la barra termine de asentarse.
  const lock = getBarbellTimeline(plates, { delay: platesAt, stepMs: step * 1000 })
  return {
    scale,
    step,
    plates,
    eyebrowAt: SCRIPT.eyebrow * scale,
    shaftAt: SCRIPT.shaft * scale,
    leadAt: SCRIPT.lead * scale,
    platesAt,
    unitAt: lock.contactAt,
    closeAt: lock.settledAt + SCRIPT.hold * scale,
  }
}

/* Salida en tres tiempos: el contenido se desvanece, las dos hojas del telón se
   abren desde el centro y recién ahí queda la página. La raíz no anima nada por
   sí misma; solo coordina a sus hijos. */
const rootVariants = {
  hidden: {},
  visible: {},
  // Desde que arranca la salida no captura más clics: la página ya es usable
  // mientras las hojas todavía se abren.
  exit: { pointerEvents: 'none' },
}

const leafVariants = (side) => ({
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5, ease: MOTION_EASE.out } },
  exit: {
    x: side === 'left' ? '-101%' : '101%',
    transition: { duration: 1.15, ease: MOTION_EASE.cinematic, delay: 0.45 },
  },
})

const contentVariants = {
  hidden: {},
  visible: {},
  exit: { opacity: 0, transition: { duration: 0.5, ease: MOTION_EASE.out } },
}

const stillPanelVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: MOTION_DURATION.base } },
  exit: { opacity: 0, transition: { duration: MOTION_DURATION.base } },
}

/** Línea de texto que sube desde una máscara en el momento indicado. */
function MaskLine({ at, children, className = '', still }) {
  return (
    <span className="pitbull-intro__mask">
      <m.span
        className={`pitbull-intro__line ${className}`.trim()}
        initial={still ? false : { y: '112%' }}
        animate={{ y: '0%' }}
        transition={{ duration: 1.1, ease: MOTION_EASE.cinematic, delay: still ? 0 : at }}
      >
        {children}
      </m.span>
    </span>
  )
}

/**
 * Pantalla de entrada a Pitbull: "FALTAN 8 SEMANAS", contada en una barra.
 * Una cortina grafito: aparece el título, se traza la barra, cada disco que
 * aterriza suma uno al número y, al cerrar el collarín, aparece la unidad.
 * Después de una pausa la cortina se levanta sola (o con clic / Escape /
 * "Continuar"). Pasa a días y horas a medida que se acerca el torneo.
 *
 * Solo transform + opacity; sin loops. Reduced motion: no se muestra (la card
 * de la página informa lo mismo). Tier low: aparición simple, barra completa.
 * Se monta en un portal porque la transición de ruta transforma al padre y
 * eso rompería `position: fixed`.
 */
export default function PitbullCountdownIntro({ event, dateLabel }) {
  const { t } = useI18n()
  const { reducedMotion, tier } = useMotionConfig()
  const startsAt = useMemo(() => resolveEventStartsAt(event), [event])
  const [headline, setHeadline] = useState(() => getEventCountdownHeadline(startsAt))
  const [open, setOpen] = useState(
    () => !reducedMotion && getEventCountdownHeadline(startsAt) !== null && !wasSeenRecently(),
  )
  const still = tier === 'low'
  const close = useCallback(() => setOpen(false), [])
  const value = headline?.value ?? 0
  const timeline = useMemo(() => buildTimeline(value, tier), [value, tier])
  const holdMs = still ? STILL_HOLD_MS : timeline.closeAt * 1000

  useEffect(() => {
    setHeadline(getEventCountdownHeadline(startsAt))
  }, [startsAt])

  useEffect(() => {
    if (!open) return undefined
    markSeen()

    const timerId = window.setTimeout(close, holdMs)
    const refreshId = window.setInterval(
      () => setHeadline(getEventCountdownHeadline(startsAt)),
      REFRESH_MS,
    )
    const onKeyDown = (keyEvent) => {
      if (keyEvent.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.clearTimeout(timerId)
      window.clearInterval(refreshId)
      window.removeEventListener('keydown', onKeyDown)
    }
    // `holdMs` cambia si el valor cambia a mitad de camino; reprogramar el cierre
    // alargaría la pantalla, así que se fija con la apertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startsAt, close])

  if (typeof document === 'undefined') return null

  const plural = value === 1 ? 'one' : 'other'
  const unitKey = headline
    ? `pages.pitbull.countdownIntro${headline.unit[0].toUpperCase()}${headline.unit.slice(1)}_${plural}`
    : ''
  const unit = headline ? t(unitKey) : ''
  const lead = t(`pages.pitbull.countdownIntroLead_${plural}`)
  const trail = t('pages.pitbull.countdownIntroTrail')
  const eyebrow = [t('pages.pitbull.countdownIntroEyebrow'), dateLabel].filter(Boolean).join(' · ')
  // Frase completa para lectores de pantalla, armada con las mismas piezas que
  // se ven (singular/plural incluido): "Falta 1 día" / "Faltan 8 semanas".
  const announcement = `${[lead, value, unit, trail].filter(Boolean).join(' ')}. ${eyebrow}`

  return createPortal(
    <AnimatePresence>
      {open && headline ? (
        <m.div
          key="pitbull-countdown-intro"
          className="pitbull-intro meet-surface"
          variants={still ? stillPanelVariants : rootVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={close}
        >
          {still ? null : (
            <>
              <m.span
                className="pitbull-intro__leaf pitbull-intro__leaf--left"
                variants={leafVariants('left')}
                aria-hidden
              />
              <m.span
                className="pitbull-intro__leaf pitbull-intro__leaf--right"
                variants={leafVariants('right')}
                aria-hidden
              />
            </>
          )}

          <p className="pitbull-intro__sr" role="status">
            {announcement}
          </p>

          <m.div
            className="pitbull-intro__stage"
            variants={still ? undefined : contentVariants}
            // Empuje lento durante toda la secuencia (animación CSS: no retiene la
            // salida de Motion ni toca el layout, solo transform).
            style={still ? undefined : { '--intro-push': `${timeline.closeAt}s` }}
            aria-hidden
          >
            <p className="pitbull-intro__eyebrow">
              <MaskLine at={timeline.eyebrowAt} still={still}>
                {eyebrow}
              </MaskLine>
            </p>

            <p className="pitbull-intro__lead">
              <MaskLine at={timeline.leadAt} still={still}>
                {lead}
              </MaskLine>
            </p>

            <p className="pitbull-intro__count">
              <span className="pitbull-intro__mask">
                <m.span
                  className="pitbull-intro__line pitbull-intro__value"
                  initial={still ? false : { y: '112%' }}
                  animate={{ y: '0%' }}
                  transition={{
                    duration: 1.1,
                    ease: MOTION_EASE.cinematic,
                    delay: still ? 0 : timeline.leadAt + 0.1,
                  }}
                >
                  <TickNumber
                    value={value}
                    delay={timeline.platesAt}
                    duration={timeline.plates * timeline.step}
                  />
                </m.span>
              </span>
              <MaskLine at={timeline.unitAt} className="pitbull-intro__unit" still={still}>
                {unit}
              </MaskLine>
            </p>

            <BarbellLoad
              className="pitbull-intro__bar"
              count={value}
              delay={timeline.platesAt}
              shaftDelay={timeline.shaftAt}
              stepMs={timeline.step * 1000}
            />

            {trail ? (
              <p className="pitbull-intro__trail">
                <MaskLine at={timeline.unitAt + 0.15} still={still}>
                  {trail}
                </MaskLine>
              </p>
            ) : null}
          </m.div>

          <m.button
            type="button"
            className="pitbull-intro__skip"
            variants={still ? undefined : contentVariants}
            onClick={close}
          >
            {t('pages.pitbull.countdownIntroSkip')}
          </m.button>
        </m.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
