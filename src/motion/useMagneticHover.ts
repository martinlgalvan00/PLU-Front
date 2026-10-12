import type { PointerEvent } from 'react'
import { useMotionConfig } from './MotionProvider'
import { hasFinePointer } from './useReducedMotion'

/** Desplazamiento máximo del botón hacia el puntero. Sutil a propósito:
 * es una confirmación de "esto es accionable", no un efecto. */
export const MAGNETIC_MAX_PX = 4

type MagneticHandlers = {
  onPointerMove?: (event: PointerEvent<HTMLElement>) => void
  onPointerLeave?: (event: PointerEvent<HTMLElement>) => void
}

/**
 * Atracción magnética mínima para una CTA principal. Escribe `--mag-x` y
 * `--mag-y` en el elemento; el `transform` lo aplica el CSS (ver
 * `.magnetic` en home-showcase.css), así que no hay estado de React ni
 * re-render por movimiento.
 *
 * Solo con puntero fino, sin reduced motion y fuera del tier `low`; en el
 * resto devuelve un objeto vacío y el botón queda estático.
 */
export function useMagneticHover(): MagneticHandlers {
  const { reducedMotion, tier } = useMotionConfig()
  const enabled = !reducedMotion && tier !== 'low' && hasFinePointer()

  if (!enabled) return {}

  return {
    onPointerMove(event) {
      const node = event.currentTarget
      const rect = node.getBoundingClientRect()
      const px = (event.clientX - rect.left) / rect.width - 0.5
      const py = (event.clientY - rect.top) / rect.height - 0.5
      node.style.setProperty('--mag-x', `${(px * MAGNETIC_MAX_PX * 2).toFixed(2)}px`)
      node.style.setProperty('--mag-y', `${(py * MAGNETIC_MAX_PX * 2).toFixed(2)}px`)
    },
    onPointerLeave(event) {
      const node = event.currentTarget
      node.style.setProperty('--mag-x', '0px')
      node.style.setProperty('--mag-y', '0px')
    },
  }
}
