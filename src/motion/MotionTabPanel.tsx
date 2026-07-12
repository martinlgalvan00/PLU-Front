import { AnimatePresence, m } from 'motion/react'
import type { ReactNode } from 'react'
import { MOTION_DURATION } from './tokens'
import { useMotionConfig } from './MotionProvider'

type MotionTabPanelProps = {
  panelKey: string
  children: ReactNode
  className?: string
}

export default function MotionTabPanel({ panelKey, children, className = '' }: MotionTabPanelProps) {
  const { reducedMotion } = useMotionConfig()

  if (reducedMotion) {
    return <div className={className.trim() || undefined}>{children}</div>
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={panelKey}
        className={className.trim() || undefined}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: MOTION_DURATION.base, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </m.div>
    </AnimatePresence>
  )
}
