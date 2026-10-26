import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m } from 'motion/react'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { prefersReducedMotion } from '../../motion/useReducedMotion.ts'
import { MOTION_DURATION, MOTION_EASE, scaleDuration } from '../../motion/tokens.ts'

/** Pausa para leer el logo antes de que viaje al hero. */
const HOLD_S = 0.4

/**
 * Delta en transform para que el logo centrado caiga sobre el del hero.
 * Sin tamaño medible (jsdom, imagen aún sin caja) no hay viaje: solo fundido.
 */
function measureTravel(coverLogo, heroLogo) {
  if (!coverLogo || !heroLogo) return null
  const from = coverLogo.getBoundingClientRect()
  const to = heroLogo.getBoundingClientRect()
  if (from.width < 1 || from.height < 1 || to.width < 1 || to.height < 1) return null
  return {
    x: to.left + to.width / 2 - (from.left + from.width / 2),
    y: to.top + to.height / 2 - (from.top + from.height / 2),
    scale: to.height / from.height,
  }
}

/**
 * Portada de entrada de Barbell Submission: el logo ocupa la pantalla y, en
 * un solo movimiento, se acomoda en el hero. Portal a `document.body` porque
 * la transición de ruta transforma al padre y eso rompe `position: fixed`.
 *
 * Clic o Escape la salta. Sin logo, con `motion: none` o con movimiento
 * reducido no se monta. En tier low el velo se funde en el lugar, sin viaje.
 */
export default function SubmissionLogoCover({
  logoUrl,
  heroLogoRef,
  themeId,
  paletteStyle,
  onDone,
}) {
  const { reducedMotion, tier } = useMotionConfig()
  const coverLogoRef = useRef(null)
  const finished = useRef(false)
  const startedExit = useRef(false)
  const onDoneRef = useRef(onDone)
  const [phase, setPhase] = useState('hold')
  const [travel, setTravel] = useState(null)
  const still = tier === 'low'
  const travelDuration = scaleDuration(MOTION_DURATION.cinematic, tier)

  onDoneRef.current = onDone

  const finish = useCallback(() => {
    if (finished.current) return
    finished.current = true
    onDoneRef.current?.()
  }, [])

  const beginExit = useCallback(() => {
    if (finished.current || startedExit.current) return
    startedExit.current = true
    setTravel(still ? null : measureTravel(coverLogoRef.current, heroLogoRef?.current))
    setPhase('exit')
  }, [heroLogoRef, still])

  useEffect(() => {
    const root = document.documentElement
    const previous = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      root.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    if (reducedMotion || prefersReducedMotion()) {
      finish()
      return undefined
    }

    const holdMs = scaleDuration(HOLD_S, tier) * 1000
    const timerId = window.setTimeout(beginExit, holdMs)
    const onKeyDown = (event) => {
      if (event.key === 'Escape') finish()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timerId)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [beginExit, finish, reducedMotion, tier])

  useEffect(() => {
    if (phase !== 'exit') return undefined
    const timerId = window.setTimeout(finish, travelDuration * 1000)
    return () => window.clearTimeout(timerId)
  }, [finish, phase, travelDuration])

  if (typeof document === 'undefined') return null

  const exiting = phase === 'exit'
  const logoAnimate =
    exiting && travel
      ? { x: travel.x, y: travel.y, scale: travel.scale, opacity: 1 }
      : exiting
        ? { x: 0, y: 0, scale: 1, opacity: 0 }
        : { x: 0, y: 0, scale: 1, opacity: 1 }

  return createPortal(
    <AnimatePresence>
      <m.div
        key="submission-logo-cover"
        className="submission-logo-cover event-landing-theme"
        data-submission-logo-cover=""
        data-event-theme={themeId}
        data-phase={phase}
        style={paletteStyle}
        aria-hidden="true"
        initial={false}
        animate={{ opacity: 1 }}
        onClick={finish}
      >
        <m.div
          className="submission-logo-cover__veil"
          initial={false}
          animate={{ opacity: exiting ? 0 : 1 }}
          transition={{ duration: travelDuration, ease: MOTION_EASE.cinematic }}
        />
        <m.img
          ref={coverLogoRef}
          alt=""
          className="submission-logo-cover__logo"
          src={logoUrl}
          initial={false}
          animate={logoAnimate}
          transition={{ duration: travelDuration, ease: MOTION_EASE.cinematic }}
        />
      </m.div>
    </AnimatePresence>,
    document.body,
  )
}
