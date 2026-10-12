import { useEffect, useRef, useState } from 'react'
import { animate } from 'motion/react'
import { useMotionConfig } from './MotionProvider'

type TickNumberProps = {
  value: number
  /** `false` hasta que arranque la secuencia (p. ej. al entrar en viewport). */
  play?: boolean
  /** Segundos antes de empezar a contar. */
  delay?: number
  /** Segundos que tarda en llegar a `value`. */
  duration?: number
  className?: string
}

/**
 * Número que sube de 0 hasta `value` en pasos enteros y lineales, pensado para
 * sincronizarse con una secuencia (un tick por disco que aterriza). Después de
 * la primera cuenta sigue al dato sin reanimar. Reduced motion: valor final.
 *
 * El texto se actualiza con estado local de este span: no re-renderiza al padre.
 */
export default function TickNumber({
  value,
  play = true,
  delay = 0,
  duration = 1,
  className,
}: TickNumberProps) {
  const { reducedMotion, tier } = useMotionConfig()
  const still = reducedMotion || tier === 'low'
  const [display, setDisplay] = useState(still ? value : 0)
  const finished = useRef(false)

  useEffect(() => {
    if (still) {
      setDisplay(value)
      return undefined
    }
    if (!play) return undefined
    if (finished.current) {
      setDisplay(value)
      return undefined
    }

    const controls = animate(0, value, {
      delay,
      duration,
      ease: 'linear',
      onUpdate: (latest) => setDisplay(Math.ceil(latest - 0.001)),
      onComplete: () => {
        finished.current = true
        setDisplay(value)
      },
    })
    return () => controls.stop()
  }, [delay, duration, play, still, value])

  return <span className={className}>{display}</span>
}
