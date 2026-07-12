import { m } from 'motion/react'
import type { ReactNode } from 'react'
import {
  sectionHeaderEyebrow,
  sectionHeaderLead,
  sectionHeaderRule,
  sectionHeaderTitle,
  staggerContainer,
} from './variants'
import { useMotionConfig } from './MotionProvider'
import { MOTION_VIEWPORT } from './tokens'

type AnimatedSectionHeaderProps = {
  eyebrow?: ReactNode
  title: ReactNode
  titleId?: string
  description?: ReactNode
  className?: string
  align?: 'left' | 'center'
  showRule?: boolean
}

export default function AnimatedSectionHeader({
  eyebrow,
  title,
  titleId,
  description,
  className = '',
  align = 'left',
  showRule = true,
}: AnimatedSectionHeaderProps) {
  const { reducedMotion } = useMotionConfig()
  const rootClass = `motion-section-header motion-section-header--${align} ${className}`.trim()

  if (reducedMotion) {
    return (
      <header className={rootClass}>
        {eyebrow ? <p className="motion-section-header__eyebrow">{eyebrow}</p> : null}
        <h2 id={titleId} className="motion-section-header__title">
          {title}
        </h2>
        {showRule ? <span className="motion-section-header__rule" aria-hidden /> : null}
        {description ? <p className="motion-section-header__lead">{description}</p> : null}
      </header>
    )
  }

  return (
    <m.header
      className={rootClass}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: MOTION_VIEWPORT.once, amount: MOTION_VIEWPORT.amount }}
      variants={staggerContainer}
    >
      {eyebrow ? (
        <m.p className="motion-section-header__eyebrow" variants={sectionHeaderEyebrow}>
          {eyebrow}
        </m.p>
      ) : null}
      <m.h2 id={titleId} className="motion-section-header__title" variants={sectionHeaderTitle}>
        {title}
      </m.h2>
      {showRule ? (
        <m.span className="motion-section-header__rule" aria-hidden variants={sectionHeaderRule} />
      ) : null}
      {description ? (
        <m.p className="motion-section-header__lead" variants={sectionHeaderLead}>
          {description}
        </m.p>
      ) : null}
    </m.header>
  )
}
