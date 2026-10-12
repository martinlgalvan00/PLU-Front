import { useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import {
  BARBELL_MAX_PLATES as MAX_PLATES,
  COLLAR_APPROACH_S,
  COLLAR_PUSH_S,
  IMPACT_S,
  PLATE_FADE_S,
  PLATE_SLIDE_S,
  getBarbellTimeline,
} from '../../lib/barbellTimeline.js'
import { MOTION_EASE } from '../../motion/tokens.ts'
import '../../styles/components/barbell-load.css'

/** Discos visibles como máximo por manga: más de esto no se distingue. */
export const BARBELL_MAX_PLATES = MAX_PLATES

/**
 * Carga por manga, de mayor a menor como en una plataforma real: discos
 * calibrados de competencia (25 · 20 · 15 · 10 · 5 kg) y, al final, los de
 * ajuste fino (2,5 y 1,25 kg). Cada peso lleva su color y espesor reglamentario
 * en `barbell-load.css` (`data-kg`).
 */
export const BARBELL_LOAD_ORDER = [25, 25, 20, 20, 15, 15, 10, 10, 5, 5, 2.5, 1.25]

/* El guion de tiempos vive en `lib/barbellTimeline.js` (lo comparten quienes
   sincronizan texto con el golpe del tope). Acá, solo geometría y curvas. */
/** Distancia a la que el tope se frena antes de empujar (px). */
const COLLAR_STANDOFF_PX = 12
/** Cuánto de la manga recorren discos y tope al entrar. */
const PLATE_TRAVEL_RATIO = 0.62
const COLLAR_TRAVEL_RATIO = 0.5
/** Ancho nominal si no se puede medir la manga (tests, SSR). */
const FALLBACK_SLEEVE_PX = 200

const PLATE_EASE = [0.45, 0, 0.15, 1]
/* Se frena a distancia y después acelera contra los discos: frena en seco. */
const COLLAR_EASE = [
  [0.2, 0.8, 0.3, 1],
  [0.55, 0, 0.9, 0.5],
]

/** Una manga: discos calibrados hacia afuera y tope al final. */
function Sleeve({ shown, play, still, delay, step }) {
  const sleeveRef = useRef(null)
  const [sleeveW, setSleeveW] = useState(0)
  const plates = BARBELL_LOAD_ORDER.slice(0, shown)
  const { collarStartAt, contactAt } = getBarbellTimeline(shown, {
    delay,
    stepMs: step * 1000,
  })

  // El recorrido de entrada se mide en px sobre la manga real (en % del propio
  // disco o tope daría unos pocos píxeles, que no se leen como una carga).
  useLayoutEffect(() => {
    const node = sleeveRef.current
    if (!node) return undefined
    const measure = () => setSleeveW(node.offsetWidth || FALLBACK_SLEEVE_PX)
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const ready = still || sleeveW > 0
  const plateTravel = sleeveW * PLATE_TRAVEL_RATIO
  const collarTravel = sleeveW * COLLAR_TRAVEL_RATIO
  const loaded = play && shown > 0

  // Recibe el golpe: retrocede hacia el eje y baja la punta, como cede una barra
  // cargada, y vuelve a asentarse. Gira sobre el lado del eje.
  const Frame = still ? 'div' : m.div
  const sleeveMotion = still
    ? {}
    : {
        initial: { x: 0, rotate: 0 },
        animate: loaded ? { x: [0, 2.5, -0.6, 0], rotate: [0, -1.1, 0.3, 0] } : { x: 0, rotate: 0 },
        transition: {
          duration: IMPACT_S,
          delay: contactAt,
          times: [0, 0.22, 0.58, 1],
          ease: 'easeOut',
        },
        style: { originX: 1, originY: 0.5 },
      }

  return (
    <Frame ref={sleeveRef} className="barbell__sleeve" {...sleeveMotion}>
      <AnimatePresence initial={!still}>
        {play && ready
          ? plates.map((kg, index) => (
              <m.span
                key={`plate-${index}`}
                className="barbell__plate"
                data-kg={kg}
                initial={still ? false : { x: -plateTravel, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{
                  x: -plateTravel * 0.3,
                  opacity: 0,
                  transition: { duration: 0.45, ease: MOTION_EASE.out },
                }}
                transition={{
                  x: {
                    duration: PLATE_SLIDE_S,
                    ease: PLATE_EASE,
                    delay: still ? 0 : delay + index * step,
                  },
                  opacity: { duration: PLATE_FADE_S, delay: still ? 0 : delay + index * step },
                }}
              />
            ))
          : null}
        {play && ready && shown > 0 ? (
          <m.span
            key="collar"
            className="barbell__collar"
            initial={still ? false : { x: -collarTravel, opacity: 0, scaleX: 1 }}
            animate={
              still
                ? { x: 0, opacity: 1, scaleX: 1 }
                : {
                    x: [-collarTravel, -COLLAR_STANDOFF_PX, 0],
                    opacity: 1,
                    scaleX: [1, 0.78, 1],
                  }
            }
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
            transition={{
              x: {
                duration: COLLAR_APPROACH_S + COLLAR_PUSH_S,
                delay: collarStartAt,
                times: [0, COLLAR_APPROACH_S / (COLLAR_APPROACH_S + COLLAR_PUSH_S), 1],
                ease: COLLAR_EASE,
              },
              opacity: { duration: PLATE_FADE_S, delay: collarStartAt },
              scaleX: { duration: 0.3, delay: contactAt, times: [0, 0.3, 1], ease: 'easeOut' },
            }}
            style={{ originX: 1, originY: 0.5 }}
          >
            <m.span
              className="barbell__collar-lock"
              initial={still ? false : { rotate: -58 }}
              animate={{ rotate: 0 }}
              transition={{
                duration: 0.28,
                delay: still ? 0 : contactAt - 0.04,
                ease: MOTION_EASE.spring,
              }}
            />
          </m.span>
        ) : null}
      </AnimatePresence>
    </Frame>
  )
}

/**
 * Barra olímpica con discos calibrados: un disco por unidad que falta (semanas,
 * días u horas). Va cargada en los dos extremos, como una barra real: los
 * discos se deslizan desde la punta uno tras otro hasta apoyarse en el anterior
 * y, al final, se ajusta el tope: entra, se frena, empuja contra los discos y
 * cierra su seguro mientras la barra cede y se asienta. Cuando el conteo baja,
 * el último disco se descarga.
 *
 * `play` arranca la carga (p. ej. al entrar en viewport); `delay` y `stepMs`
 * permiten sincronizarla con un número que cuenta (ver TickNumber) y
 * `shaftDelay` adelanta el trazo del eje respecto de los discos. Para sincronizar
 * texto con el golpe del tope usar `getBarbellTimeline`.
 *
 * Solo transform + opacity, una sola vez. Reduced motion / tier low: barra ya
 * cargada y con el tope cerrado.
 */
export default function BarbellLoad({
  count,
  play = true,
  delay = 0,
  shaftDelay = delay,
  stepMs = 260,
  className = '',
}) {
  const { reducedMotion, tier } = useMotionConfig()
  const still = reducedMotion || tier === 'low'
  const shown = Math.max(0, Math.min(count, BARBELL_MAX_PLATES))
  const step = stepMs / 1000

  return (
    <div
      className={`barbell ${className}`.trim()}
      data-capped={count > BARBELL_MAX_PLATES ? 'true' : undefined}
      aria-hidden
    >
      {still ? (
        <span className="barbell__shaft" />
      ) : (
        <m.span
          className="barbell__shaft"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: play ? 1 : 0 }}
          transition={{ duration: 1, ease: MOTION_EASE.cinematic, delay: shaftDelay }}
        />
      )}

      <div className="barbell__half">
        <Sleeve shown={shown} play={play} still={still} delay={delay} step={step} />
      </div>
      <div className="barbell__half barbell__half--right">
        <Sleeve shown={shown} play={play} still={still} delay={delay} step={step} />
      </div>
    </div>
  )
}
