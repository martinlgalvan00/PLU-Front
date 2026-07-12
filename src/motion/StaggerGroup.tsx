import { m } from 'motion/react'
import {
  Children,
  isValidElement,
  type ComponentPropsWithoutRef,
  type ElementType,
  type ReactElement,
  type ReactNode,
} from 'react'
import { MOTION_VIEWPORT, MOTION_STAGGER } from './tokens'
import { getStaggerItemVariant, staggerContainer, type RevealDirection } from './variants'
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
])

function resolveMotionTag(tag: ElementType) {
  if (typeof tag === 'string' && MOTION_TAGS.has(tag)) {
    return m[tag as keyof typeof m] as typeof m.div
  }
  return m.div
}

type StaggerGroupProps<T extends ElementType = 'div'> = {
  as?: T
  children: ReactNode
  className?: string
  direction?: RevealDirection
  /** @deprecated use direction */
  variant?: RevealDirection
  stagger?: number
  delayChildren?: number
  once?: boolean
  amount?: number
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className'>

export default function StaggerGroup<T extends ElementType = 'div'>({
  as,
  children,
  className = '',
  direction,
  variant = 'up',
  stagger = MOTION_STAGGER.step * 1000,
  delayChildren = MOTION_STAGGER.delayChildren * 1000,
  once = MOTION_VIEWPORT.once,
  amount = MOTION_VIEWPORT.amount,
  ...rest
}: StaggerGroupProps<T>) {
  const { reducedMotion } = useMotionConfig()
  const Tag = (as ?? 'div') as ElementType
  const MotionTag = resolveMotionTag(Tag)
  const resolvedDirection = direction ?? variant
  const itemVariant = getStaggerItemVariant(resolvedDirection)

  if (reducedMotion) {
    const StaticTag = Tag as 'div'
    return (
      <StaticTag className={className.trim() || undefined} {...rest}>
        {children}
      </StaticTag>
    )
  }

  const containerVariants = {
    ...staggerContainer,
    visible: {
      ...staggerContainer.visible,
      transition: {
        staggerChildren: stagger / 1000,
        delayChildren: delayChildren / 1000,
      },
    },
  }

  return (
    <MotionTag
      className={className.trim() || undefined}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount, margin: MOTION_VIEWPORT.margin }}
      variants={containerVariants}
      {...rest}
    >
      {Children.map(children, (child, index) => {
        if (!isValidElement(child)) return child

        return (
          <m.div key={(child as ReactElement).key ?? index} variants={itemVariant}>
            {child}
          </m.div>
        )
      })}
    </MotionTag>
  )
}
