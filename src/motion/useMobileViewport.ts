import { useEffect, useState } from 'react'

export const MOBILE_VIEWPORT_QUERY = '(max-width: 767px)'

/**
 * Viewport mobile reactivo para decisiones de motion. La transición de ruta
 * es direccional en mobile (el pulgar navega en X) y editorial vertical en
 * desktop: el breakpoint es el mismo que usa el CSS para el drawer/header.
 *
 * SSR-safe: sin matchMedia devuelve false (desktop) — coherente con el
 * primer paint de layouts amplios.
 */
export function useMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches
  })

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const query = window.matchMedia(MOBILE_VIEWPORT_QUERY)
    function handleChange(event) {
      setIsMobile(event.matches)
    }
    query.addEventListener('change', handleChange)
    setIsMobile(query.matches)
    return () => query.removeEventListener('change', handleChange)
  }, [])

  return isMobile
}
