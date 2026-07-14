import { AnimatePresence, m } from 'motion/react'
import type { ReactNode } from 'react'
import { MOTION_DURATION } from './tokens'
import { useMotionConfig } from './MotionProvider'

type MotionContentSwapProps = {
  children: ReactNode
  className?: string
  swapKey: string
  /** 1 = hacia adelante, -1 = hacia atrás. Si no se pasa, usa fade vertical. */
  direction?: 1 | -1
}

export default function MotionContentSwap({
  children,
  className = '',
  swapKey,
  direction,
}: MotionContentSwapProps) {
  const { reducedMotion } = useMotionConfig()

  if (reducedMotion) {
    return <div className={className.trim() || undefined}>{children}</div>
  }

  const horizontal = direction === 1 || direction === -1
  const axis = horizontal ? direction : 0

  return (
    <AnimatePresence mode="wait" initial={false}>
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
            ? { opacity: 0, x: -14 * axis }
            : { opacity: 0, y: -6 }
        }
        transition={{ duration: MOTION_DURATION.fast, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </m.div>
    </AnimatePresence>
  )
}
