import { m, useScroll } from 'motion/react'
import type { RefObject } from 'react'
import { useMotionConfig } from './MotionProvider'

type ScrollRailProps = {
  /** Contenedor cuyo recorrido de scroll llena el riel. */
  targetRef: RefObject<HTMLElement | null>
  axis?: 'y' | 'x'
  className?: string
  /** Offsets de `useScroll`: cuándo empieza y cuándo termina de llenarse. */
  offset?: [string, string]
}

const DEFAULT_OFFSET: [string, string] = ['start 72%', 'end 58%']

/**
 * Línea que se dibuja con el scroll del contenedor. Solo anima `transform`
 * (scaleY / scaleX) sobre un MotionValue: no re-renderiza React en cada frame.
 * Reduced motion / tier low: riel completo y estático.
 *
 * Estilos en `styles/components/scroll-rail.css`: cada consumidor lo importa
 * junto a su página para no sumarlo al CSS global.
 */
export default function ScrollRail({
  targetRef,
  axis = 'y',
  className = '',
  offset = DEFAULT_OFFSET,
}: ScrollRailProps) {
  const { reducedMotion, tier } = useMotionConfig()
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: offset as never,
  })
  const still = reducedMotion || tier === 'low'
  const classes = `scroll-rail scroll-rail--${axis} ${className}`.trim()

  return (
    <span className={classes} aria-hidden>
      <m.span
        className="scroll-rail__fill"
        style={still ? undefined : axis === 'y' ? { scaleY: scrollYProgress } : { scaleX: scrollYProgress }}
      />
    </span>
  )
}
