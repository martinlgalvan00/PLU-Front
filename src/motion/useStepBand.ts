import { useCallback, useEffect, useRef, useState } from 'react'

/** Franja central del viewport: el paso que la cruza pasa a ser el activo. */
export const STEP_BAND_MARGIN = '-42% 0px -42% 0px'

type StepPosition = 'above' | 'in' | 'below'

type UseStepBandOptions = {
  /** `false` en reduced motion / tier low: no se observa nada. */
  enabled?: boolean
  rootMargin?: string
}

/**
 * Paso activo de una lista según el scroll, sin listeners de scroll: un solo
 * IntersectionObserver sobre una franja central. El índice activo es el último
 * paso que ya entró en la franja (o la pasó), así volver arriba de todo
 * devuelve el primero y llegar al final deja el último encendido.
 *
 * Uso: `ref={bind(index)}` en cada paso.
 */
export function useStepBand(
  count: number,
  { enabled = true, rootMargin = STEP_BAND_MARGIN }: UseStepBandOptions = {},
) {
  const [activeIndex, setActiveIndex] = useState(0)
  const nodes = useRef<Array<HTMLElement | null>>([])

  const bind = useCallback(
    (index: number) => (node: HTMLElement | null) => {
      nodes.current[index] = node
    },
    [],
  )

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') return undefined

    const positions: StepPosition[] = Array.from({ length: count }, () => 'below')
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.stepIndex)
          if (!Number.isInteger(index)) continue
          if (entry.isIntersecting) {
            positions[index] = 'in'
          } else {
            const bounds = entry.rootBounds
            const middle = bounds ? bounds.top + bounds.height / 2 : window.innerHeight / 2
            positions[index] = entry.boundingClientRect.top >= middle ? 'below' : 'above'
          }
        }
        let reached = 0
        positions.forEach((position, index) => {
          if (position !== 'below') reached = index
        })
        setActiveIndex(reached)
      },
      { rootMargin },
    )

    nodes.current.slice(0, count).forEach((node, index) => {
      if (!node) return
      node.dataset.stepIndex = String(index)
      observer.observe(node)
    })

    return () => observer.disconnect()
  }, [count, enabled, rootMargin])

  return { activeIndex, bind }
}
