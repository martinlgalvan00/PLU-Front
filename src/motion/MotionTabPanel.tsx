import { AnimatePresence, m } from 'motion/react'
import type { ReactNode } from 'react'
import { MOTION_DURATION, MOTION_EASE } from './tokens'
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
        // Settle cinematográfico corto: el panel sube 8px y frena suave. La
        // salida solo disuelve — un tab no necesita competir con la entrada.
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: MOTION_DURATION.fast, ease: MOTION_EASE.standard } }}
        transition={{ duration: MOTION_DURATION.base + 0.04, ease: MOTION_EASE.cinematic }}
      >
        {children}
      </m.div>
    </AnimatePresence>
  )
}
