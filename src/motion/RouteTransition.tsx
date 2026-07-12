import { AnimatePresence, m } from 'motion/react'
import type { ReactNode } from 'react'
import { MOTION_DURATION } from './tokens'
import { pageSectionTransition } from './variants'
import { useMotionConfig } from './MotionProvider'

type RouteTransitionProps = {
  children: ReactNode
  viewKey: string
  direction?: 'forward' | 'back'
}

export default function RouteTransition({
  children,
  viewKey,
  direction = 'forward',
}: RouteTransitionProps) {
  const { reducedMotion } = useMotionConfig()

  if (reducedMotion) {
    return <div className="page-transition page-transition--idle">{children}</div>
  }

  const exitY = direction === 'back' ? 8 : -6

  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={viewKey}
        className="page-transition page-transition--motion"
        variants={pageSectionTransition}
        initial="hidden"
        animate="visible"
        exit={{
          opacity: 0,
          y: exitY,
          transition: { duration: MOTION_DURATION.fast, ease: [0.2, 0, 0, 1] },
        }}
      >
        {children}
      </m.div>
    </AnimatePresence>
  )
}
