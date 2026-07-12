import { m } from 'motion/react'
import type { ReactNode } from 'react'
import { MOTION_DURATION, MOTION_VIEWPORT } from './tokens'
import { useMotionConfig } from './MotionProvider'

type MaskRevealProps = {
  children: ReactNode
  className?: string
  delay?: number
  /** inset from top — editorial wipe */
  direction?: 'up' | 'left' | 'right'
}

const CLIP_HIDDEN = {
  up: 'inset(100% 0 0 0)',
  left: 'inset(0 100% 0 0)',
  right: 'inset(0 0 0 100%)',
} as const

export default function MaskReveal({
  children,
  className = '',
  delay = 0,
  direction = 'up',
}: MaskRevealProps) {
  const { reducedMotion } = useMotionConfig()

  if (reducedMotion) {
    return <div className={className.trim() || undefined}>{children}</div>
  }

  return (
    <m.div
      className={`mask-reveal mask-reveal--${direction} ${className}`.trim()}
      initial={{ clipPath: CLIP_HIDDEN[direction], opacity: 0.92 }}
      whileInView={{ clipPath: 'inset(0 0 0 0)', opacity: 1 }}
      viewport={{ once: MOTION_VIEWPORT.once, amount: 0.2 }}
      transition={{
        duration: MOTION_DURATION.slow,
        ease: [0.22, 1, 0.36, 1],
        delay: delay / 1000,
      }}
    >
      {children}
    </m.div>
  )
}
