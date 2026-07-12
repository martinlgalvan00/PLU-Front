import type { ReactNode } from 'react'
import TiltCard from './TiltCard'

type EventDatePlateProps = {
  day: string
  month: string
  className?: string
  /** figcaption content wrapper */
  as?: 'figcaption' | 'div'
  children?: ReactNode
  /** Tilt 3D con mouse; desactivar en badges compactos (ej. home spotlight) */
  tilt?: boolean
}

export default function EventDatePlate({
  day,
  month,
  className = '',
  as: Tag = 'figcaption',
  children,
  tilt = true,
}: EventDatePlateProps) {
  const plateClass = `event-date-plate ${className}`.trim()

  const content = (
    <Tag className="event-date-plate__content">
      <span className="event-date-plate__day">{day}</span>
      <span className="event-date-plate__month">{month}</span>
      {children}
    </Tag>
  )

  if (!tilt) {
    return <div className={`${plateClass} event-date-plate--static`.trim()}>{content}</div>
  }

  return (
    <TiltCard className={plateClass} innerClassName="event-date-plate__face" maxTilt={5}>
      {content}
    </TiltCard>
  )
}
