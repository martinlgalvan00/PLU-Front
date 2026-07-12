import { AnimatePresence, m } from 'motion/react'
import type { ReactNode } from 'react'
import { MOTION_DURATION } from './tokens'
import { useMotionConfig } from './MotionProvider'

type MotionContentSwapProps = {
  children: ReactNode
  className?: string
  swapKey: string
}

export default function MotionContentSwap({
  children,
  className = '',
  swapKey,
}: MotionContentSwapProps) {
  const { reducedMotion } = useMotionConfig()

  if (reducedMotion) {
    return <div className={className.trim() || undefined}>{children}</div>
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={swapKey}
        className={className.trim() || undefined}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: MOTION_DURATION.fast, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </m.div>
    </AnimatePresence>
  )
}
