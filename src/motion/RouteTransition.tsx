import { AnimatePresence, m } from 'motion/react'
import type { ReactNode } from 'react'
import { MOTION_DURATION, MOTION_EASE, scaleDuration } from './tokens'
import { pageSectionTransition } from './variants'
import { useMotionConfig } from './MotionProvider'
import { useMobileViewport } from './useMobileViewport'

type RouteTransitionProps = {
  children: ReactNode
  viewKey: string
  direction?: 'forward' | 'back'
  id?: string
  tabIndex?: number
}

/**
 * En mobile la transición es direccional en X — el pulgar navega hacia
 * adelante/atrás y la página entra desde donde llegó el gesto: avanzar entra
 * desde la derecha (24px, presente), volver desde la izquierda (14px, leve).
 * La saliente siempre disuelve quieta: una sola superficie animada por vez,
 * sin empuje que duplique el movimiento.
 *
 * En desktop se mantiene el rise editorial vertical (variant compartida).
 */
export default function RouteTransition({
  children,
  viewKey,
  direction = 'forward',
  id,
  tabIndex,
}: RouteTransitionProps) {
  const { reducedMotion, tier } = useMotionConfig()
  const isMobile = useMobileViewport()

  if (reducedMotion || tier === 'low') {
    return (
      <div className="page-transition page-transition--idle" id={id} tabIndex={tabIndex}>
        {children}
      </div>
    )
  }

  const mobileEnterX = direction === 'back' ? -14 : 24
  // Settle cinematográfico con la duración de página (0.34s) escalada por
  // tier: misma coreografía, menos tiempo de compositor en equipos que no
  // sostienen 60fps.
  const mobileDuration = scaleDuration(MOTION_DURATION.page, tier)

  const initial = isMobile
    ? { opacity: 0, x: mobileEnterX }
    : { opacity: 0, y: 14 }

  const exit = isMobile
    ? { opacity: 0, transition: { duration: MOTION_DURATION.fast, ease: MOTION_EASE.standard } }
    : {
        opacity: 0,
        y: direction === 'back' ? 6 : -3,
        transition: { duration: MOTION_DURATION.fast, ease: MOTION_EASE.standard },
      }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={viewKey}
        className="page-transition page-transition--motion"
        id={id}
        tabIndex={tabIndex}
        initial={initial}
        animate={isMobile ? { opacity: 1, x: 0 } : 'visible'}
        variants={isMobile ? undefined : pageSectionTransition}
        exit={exit}
        transition={
          isMobile
            ? { duration: mobileDuration, ease: MOTION_EASE.cinematic }
            : undefined
        }
      >
        {children}
      </m.div>
    </AnimatePresence>
  )
}
