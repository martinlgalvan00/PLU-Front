import { useCallback, useRef, type ReactNode, type CSSProperties, type PointerEvent } from 'react'
import { TILT_MAX_DEG } from './tokens'
import { hasFinePointer, useReducedMotion } from './useReducedMotion'

type TiltCardProps = {
  children: ReactNode
  className?: string
  maxTilt?: number
  style?: CSSProperties
  /** Clase del elemento interno que recibe el reflejo 3D */
  innerClassName?: string
}

export default function TiltCard({
  children,
  className = '',
  maxTilt = TILT_MAX_DEG,
  style,
  innerClassName = 'tilt-card__inner',
}: TiltCardProps) {
  const reducedMotion = useReducedMotion()
  const canTilt = !reducedMotion && hasFinePointer()
  const rootRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | null>(null)
  const leaveTimerRef = useRef<number | null>(null)

  const resetTilt = useCallback(() => {
    const node = rootRef.current
    if (!node) return
    node.style.setProperty('--tilt-x', '0deg')
    node.style.setProperty('--tilt-y', '0deg')
    node.style.setProperty('--tilt-shift-x', '0px')
    node.style.setProperty('--tilt-shift-y', '0px')
  }, [])

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!canTilt) return
      const node = rootRef.current
      if (!node) return

      if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
      if (leaveTimerRef.current != null) window.clearTimeout(leaveTimerRef.current)

      const rect = node.getBoundingClientRect()
      const px = (event.clientX - rect.left) / rect.width - 0.5
      const py = (event.clientY - rect.top) / rect.height - 0.5
      const rotateY = px * maxTilt * 2
      const rotateX = -py * maxTilt * 2

      frameRef.current = requestAnimationFrame(() => {
        node.style.setProperty('--tilt-x', `${rotateX.toFixed(2)}deg`)
        node.style.setProperty('--tilt-y', `${rotateY.toFixed(2)}deg`)
        node.style.setProperty('--tilt-shift-x', `${(px * 6).toFixed(1)}px`)
        node.style.setProperty('--tilt-shift-y', `${(py * 4).toFixed(1)}px`)
      })
    },
    [canTilt, maxTilt],
  )

  const handlePointerLeave = useCallback(() => {
    if (!canTilt) return
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
    leaveTimerRef.current = window.setTimeout(resetTilt, 40)
  }, [canTilt, resetTilt])

  const rootClass = `tilt-card ${canTilt ? 'tilt-card--interactive' : ''} ${className}`.trim()

  return (
    <div
      ref={rootRef}
      className={rootClass}
      style={style}
      onPointerMove={canTilt ? handlePointerMove : undefined}
      onPointerLeave={canTilt ? handlePointerLeave : undefined}
    >
      <div className={innerClassName}>{children}</div>
    </div>
  )
}
