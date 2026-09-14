import { useEffect, useState } from 'react'

/**
 * Detecta `animation-timeline: view()` para el teatro de scroll.
 * Si no hay soporte, los showcases caen a whileInView (one-shot).
 */
export function supportsCssViewTimeline(): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false
  return CSS.supports('animation-timeline: view()') || CSS.supports('animation-timeline', 'view()')
}

export function useCssViewTimeline(): boolean {
  const [supported, setSupported] = useState(supportsCssViewTimeline)

  useEffect(() => {
    setSupported(supportsCssViewTimeline())
  }, [])

  return supported
}
