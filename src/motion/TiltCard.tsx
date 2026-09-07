import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
  type PointerEvent,
} from 'react'
import { MOTION_TIER_SCALE, TILT_MAX_DEG } from './tokens'
import { hasFinePointer } from './useReducedMotion'
import { useMotionConfig } from './MotionProvider'

type TiltCardProps = {
  children: ReactNode
  className?: string
  /** Ángulo base en tier `high`. Se escala hacia abajo en `mid`/`low` — nunca
   * queda fijo, ni cuando el caller lo pasa explícito (ej. la credencial
   * usa un ángulo más sutil que el default, pero sigue respondiendo al
   * tier del dispositivo). */
  maxTilt?: number
  style?: CSSProperties
  /** Clase del elemento interno que recibe el reflejo 3D */
  innerClassName?: string
}

export default function TiltCard({
  children,
  className = '',
  maxTilt,
  style,
  innerClassName = 'tilt-card__inner',
}: TiltCardProps) {
  const { reducedMotion, tier } = useMotionConfig()
  const canTilt = !reducedMotion && tier !== 'low' && hasFinePointer()
  const resolvedMaxTilt = (maxTilt ?? TILT_MAX_DEG) * MOTION_TIER_SCALE[tier]
  const rootRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | null>(null)
  const leaveTimerRef = useRef<number | null>(null)
  const [tiltActive, setTiltActive] = useState(false)

  useEffect(
    () => () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
      if (leaveTimerRef.current != null) window.clearTimeout(leaveTimerRef.current)
    },
    [],
  )

  const resetTilt = useCallback(() => {
    const node = rootRef.current
    if (!node) return
    node.style.setProperty('--tilt-x', '0deg')
    node.style.setProperty('--tilt-y', '0deg')
    node.style.setProperty('--tilt-shift-x', '0px')
    node.style.setProperty('--tilt-shift-y', '0px')
    node.style.setProperty('--tilt-px', '0')
    node.style.setProperty('--tilt-py', '0')
    node.style.setProperty('--tilt-glare-x', '50%')
    node.style.setProperty('--tilt-glare-y', '0%')
    node.style.setProperty('--tilt-active', '0')
    setTiltActive(false)
  }, [])

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!canTilt) return
      const node = rootRef.current
      if (!node) return

      if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
      if (leaveTimerRef.current != null) window.clearTimeout(leaveTimerRef.current)

      const rect = node.getBoundingClientRect()
      const nx = (event.clientX - rect.left) / rect.width
      const ny = (event.clientY - rect.top) / rect.height
      const px = nx - 0.5
      const py = ny - 0.5
      const rotateY = px * resolvedMaxTilt * 2
      const rotateX = -py * resolvedMaxTilt * 2

      frameRef.current = requestAnimationFrame(() => {
        node.style.setProperty('--tilt-x', `${rotateX.toFixed(2)}deg`)
        node.style.setProperty('--tilt-y', `${rotateY.toFixed(2)}deg`)
        node.style.setProperty('--tilt-shift-x', `${(px * 6).toFixed(1)}px`)
        node.style.setProperty('--tilt-shift-y', `${(py * 4).toFixed(1)}px`)
        node.style.setProperty('--tilt-px', px.toFixed(3))
        node.style.setProperty('--tilt-py', py.toFixed(3))
        node.style.setProperty('--tilt-glare-x', `${(nx * 100).toFixed(1)}%`)
        node.style.setProperty('--tilt-glare-y', `${(ny * 100).toFixed(1)}%`)
        node.style.setProperty('--tilt-active', '1')
        setTiltActive(true)
      })
    },
    [canTilt, resolvedMaxTilt],
  )

  const handlePointerLeave = useCallback(() => {
    if (!canTilt) return
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
    // Settle un poco más largo que el tracking — se siente premium, no “snap”.
    leaveTimerRef.current = window.setTimeout(resetTilt, 60)
  }, [canTilt, resetTilt])

  const rootClass = `tilt-card ${canTilt ? 'tilt-card--interactive' : ''} ${className}`.trim()

  return (
    <div
      ref={rootRef}
      className={rootClass}
      style={style}
      data-tilt-active={tiltActive ? '1' : '0'}
      onPointerMove={canTilt ? handlePointerMove : undefined}
      onPointerLeave={canTilt ? handlePointerLeave : undefined}
    >
      <div className={innerClassName}>{children}</div>
    </div>
  )
}
