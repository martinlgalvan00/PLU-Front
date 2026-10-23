import { useEffect, useRef, useState } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import {
  BAR_KG,
  clampPlates,
  initialPlates,
  INTRO_STEP_MS,
  loadedKg,
  MAX_PLATES,
  platesFor,
} from '../../../lib/eventConstruction.js'
import '../../../styles/pages/event-construction-scene.css'

// Mitad de la barra en el viewBox; cada disco ocupa PLATE_WIDTH + PLATE_GAP hacia afuera.
const CENTER = 320
const COLLAR_X = 150
const PLATE_WIDTH = 20
const PLATE_GAP = 4
const BAR_Y = 110
// Alto del disco por peso: 20 kg es el más grande.
const PLATE_HEIGHT = { 20: 176, 15: 148, 10: 116, 5: 84 }

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Barra olímpica que se carga sola al entrar (como un video corto) y que el
 * visitante puede seguir cargando, sacando o reiniciar. La inclinación con el
 * mouse y la entrada automática se apagan con `motion = none` y con movimiento
 * reducido; los botones andan igual con teclado y táctil.
 */
export default function ConstructionScene({ motion = 'soft', t }) {
  const animated = motion !== 'none' && !prefersReducedMotion()
  const [count, setCount] = useState(() => initialPlates({ animated }))
  const [autoplay, setAutoplay] = useState(animated)
  const figureRef = useRef(null)

  // Entrada automática: un disco por vez hasta llenar la barra o hasta que el visitante toque algo.
  useEffect(() => {
    if (!autoplay) return undefined
    if (count >= MAX_PLATES) {
      setAutoplay(false)
      return undefined
    }
    const timer = setTimeout(() => setCount((current) => clampPlates(current + 1)), INTRO_STEP_MS)
    return () => clearTimeout(timer)
  }, [autoplay, count])

  function change(next) {
    setAutoplay(false)
    setCount(clampPlates(next))
  }

  function replay() {
    setCount(initialPlates({ animated }))
    setAutoplay(animated)
  }

  // La barra se inclina hacia el mouse (hasta 2.5°). Sin re-render: solo una variable CSS.
  function tilt(event) {
    if (!animated || event.pointerType !== 'mouse') return
    const box = figureRef.current?.getBoundingClientRect()
    if (!box?.width) return
    const ratio = ((event.clientX - box.left) / box.width) * 2 - 1
    figureRef.current.style.setProperty('--cs-tilt', `${(ratio * 2.5).toFixed(2)}deg`)
  }

  function resetTilt() {
    figureRef.current?.style.removeProperty('--cs-tilt')
  }

  const plates = platesFor(count)
  const kg = loadedKg(count)
  const full = count >= MAX_PLATES

  // Posición de cada disco hacia afuera del collarín; el lado izquierdo es el espejo.
  let offset = 0
  const placed = plates.map((weight, index) => {
    const x = offset
    offset += PLATE_WIDTH + PLATE_GAP
    return { weight, index, x }
  })

  return (
    <div className="construction-scene" data-motion={motion}>
      <figure
        ref={figureRef}
        className="construction-scene__figure"
        onPointerMove={tilt}
        onPointerLeave={resetTilt}
      >
        <svg
          className="construction-scene__svg"
          viewBox="0 0 640 220"
          role="img"
          aria-label={t('pages.eventUnderConstruction.sceneLabel', { kg })}
        >
          <g className="construction-scene__bar">
            <rect
              className="construction-scene__shaft"
              x="24"
              y={BAR_Y - 5}
              width="592"
              height="10"
              rx="5"
            />
            {[COLLAR_X, 640 - COLLAR_X - 10].map((x) => (
              <rect
                key={x}
                className="construction-scene__collar"
                x={x}
                y={BAR_Y - 14}
                width="10"
                height="28"
                rx="3"
              />
            ))}
            {placed.map(({ weight, index, x }) => {
              const height = PLATE_HEIGHT[weight]
              return ['left', 'right'].map((side) => {
                const left = side === 'left'
                const px = left
                  ? COLLAR_X - PLATE_GAP - PLATE_WIDTH - x
                  : 640 - COLLAR_X + PLATE_GAP + x
                return (
                  <rect
                    key={`${side}-${index}`}
                    className={`construction-scene__plate construction-scene__plate--${weight}`}
                    data-side={side}
                    x={px}
                    y={BAR_Y - height / 2}
                    width={PLATE_WIDTH}
                    height={height}
                    rx="4"
                  />
                )
              })
            })}
            <title>{t('pages.eventUnderConstruction.sceneLabel', { kg })}</title>
          </g>
        </svg>
        <figcaption className="construction-scene__caption" aria-live="polite">
          <strong>{kg} kg</strong>
          <span>
            {full
              ? t('pages.eventUnderConstruction.sceneFull')
              : t('pages.eventUnderConstruction.sceneHint', { bar: BAR_KG })}
          </span>
        </figcaption>
      </figure>

      <div
        className="construction-scene__controls"
        role="group"
        aria-label={t('pages.eventUnderConstruction.sceneControls')}
      >
        <button type="button" disabled={count <= 0} onClick={() => change(count - 1)}>
          <Minus aria-hidden size={16} />
          {t('pages.eventUnderConstruction.sceneRemove')}
        </button>
        <button type="button" disabled={full} onClick={() => change(count + 1)}>
          <Plus aria-hidden size={16} />
          {t('pages.eventUnderConstruction.sceneAdd')}
        </button>
        <button type="button" onClick={replay}>
          <RotateCcw aria-hidden size={16} />
          {t('pages.eventUnderConstruction.sceneReplay')}
        </button>
      </div>
    </div>
  )
}
