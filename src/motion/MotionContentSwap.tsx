import { AnimatePresence, m } from 'motion/react'
import type { ReactNode } from 'react'
import { MOTION_DURATION, MOTION_EASE } from './tokens'
import { useMotionConfig } from './MotionProvider'

type MotionContentSwapProps = {
  children: ReactNode
  className?: string
  swapKey: string
  /** 1 = hacia adelante, -1 = hacia atrás. Si no se pasa, usa fade vertical. */
  direction?: 1 | -1
  /**
   * `wait` (default) desmonta el saliente antes de montar el entrante: el
   * contenedor colapsa un frame. `sync` los superpone — el padre debe ser una
   * grilla con ambos paneles en `grid-area: 1 / 1` — y evita el salto de alto
   * en tarjetas centradas o con footer pegado.
   */
  mode?: 'wait' | 'sync'
}

export default function MotionContentSwap({
  children,
  className = '',
  swapKey,
  direction,
  mode = 'wait',
}: MotionContentSwapProps) {
  const { reducedMotion } = useMotionConfig()

  if (reducedMotion) {
    return <div className={className.trim() || undefined}>{children}</div>
  }

  const horizontal = direction === 1 || direction === -1
  const axis = horizontal ? direction : 0
  const overlapped = mode === 'sync'

  return (
    <AnimatePresence mode={mode} initial={false}>
      <m.div
        key={swapKey}
        className={className.trim() || undefined}
        initial={
          horizontal
            ? { opacity: 0, x: 18 * axis }
            : { opacity: 0, y: 8 }
        }
        animate={{ opacity: 1, x: 0, y: 0 }}
        exit={
          horizontal
            ? // Superpuesto el saliente sigue en el DOM: sin pointer-events el
              // click cae en el panel fantasma durante la transición.
              { opacity: 0, x: -14 * axis, ...(overlapped ? { pointerEvents: 'none' as const } : null) }
            : { opacity: 0, y: -6, ...(overlapped ? { pointerEvents: 'none' as const } : null) }
        }
        transition={{
          duration: overlapped ? MOTION_DURATION.base : MOTION_DURATION.fast,
          ease: MOTION_EASE.out,
        }}
      >
        {children}
      </m.div>
    </AnimatePresence>
  )
}
