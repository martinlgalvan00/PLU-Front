import { m } from 'motion/react'
import type { ReactNode } from 'react'
import { MOTION_DURATION, MOTION_EASE, MOTION_VIEWPORT } from './tokens'
import { useMotionConfig } from './MotionProvider'
import { hasFinePointer } from './useReducedMotion'

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
  const classNames = `mask-reveal mask-reveal--${direction} ${className}`.trim()
  const delaySec = delay / 1000

  if (reducedMotion) {
    return <div className={className.trim() || undefined}>{children}</div>
  }

  /* Touch / coarse: opacity + y — evita clip-path (paint caro en GPU mobile). */
  if (!hasFinePointer()) {
    return (
      <m.div
        className={classNames}
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: MOTION_VIEWPORT.once, amount: 0.2 }}
        transition={{
          duration: MOTION_DURATION.slow,
          ease: MOTION_EASE.out,
          delay: delaySec,
        }}
      >
        {children}
      </m.div>
    )
  }

  return (
    <m.div
      className={classNames}
      initial={{ clipPath: CLIP_HIDDEN[direction], opacity: 0.92 }}
      whileInView={{ clipPath: 'inset(0 0 0 0)', opacity: 1 }}
      viewport={{ once: MOTION_VIEWPORT.once, amount: 0.2 }}
      transition={{
        duration: MOTION_DURATION.slow,
        ease: MOTION_EASE.out,
        delay: delaySec,
      }}
    >
      {children}
    </m.div>
  )
}
