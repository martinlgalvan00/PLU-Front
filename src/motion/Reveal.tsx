import { m } from 'motion/react'
import type { TargetAndTransition, Variants } from 'motion/react'
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react'
import { MOTION_VIEWPORT, MOTION_DURATION, scaleDuration } from './tokens'
import { getRevealVariant, type RevealDirection } from './variants'
import { useMotionConfig } from './MotionProvider'

const MOTION_TAGS = new Set([
  'div',
  'section',
  'article',
  'header',
  'footer',
  'nav',
  'main',
  'aside',
  'ul',
  'ol',
  'li',
  'span',
  'p',
])

function resolveMotionTag(tag: ElementType) {
  if (typeof tag === 'string' && MOTION_TAGS.has(tag)) {
    return m[tag as keyof typeof m] as typeof m.div
  }
  return m.div
}

type RevealProps<T extends ElementType = 'div'> = {
  as?: T
  children: ReactNode
  className?: string
  direction?: RevealDirection
  /** @deprecated use direction */
  variant?: RevealDirection
  delay?: number
  duration?: number
  distance?: number
  once?: boolean
  amount?: number
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className'>

export default function Reveal<T extends ElementType = 'div'>({
  as,
  children,
  className = '',
  direction,
  variant = 'up',
  delay = 0,
  duration,
  distance,
  once = MOTION_VIEWPORT.once,
  amount = MOTION_VIEWPORT.amount,
  ...rest
}: RevealProps<T>) {
  const { reducedMotion, tier } = useMotionConfig()
  const Tag = (as ?? 'div') as ElementType
  const MotionTag = resolveMotionTag(Tag)
  const resolvedDirection = direction ?? variant
  const variants = getRevealVariant(resolvedDirection)

  if (reducedMotion || tier === 'low') {
    const StaticTag = Tag as 'div'
    return (
      <StaticTag className={className.trim() || undefined} {...rest}>
        {children}
      </StaticTag>
    )
  }

  const hidden = { ...(variants.hidden as TargetAndTransition) }
  const visible = { ...(variants.visible as TargetAndTransition) }

  if (typeof distance === 'number') {
    if (hidden.y != null) hidden.y = distance
    if (visible.y != null) visible.y = 0
    if (hidden.x != null) hidden.x = distance
    if (visible.x != null) visible.x = 0
  }

  const motionVariants: Variants = { hidden, visible }

  return (
    <MotionTag
      className={className.trim() || undefined}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount, margin: MOTION_VIEWPORT.margin }}
      variants={motionVariants}
      transition={{
        duration: scaleDuration(duration != null ? duration / 1000 : MOTION_DURATION.reveal, tier),
        delay: delay / 1000,
        ease: [0.22, 1, 0.36, 1],
      }}
      {...rest}
    >
      {children}
    </MotionTag>
  )
}
