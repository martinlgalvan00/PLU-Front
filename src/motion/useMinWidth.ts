import { useEffect, useState } from 'react'

/**
 * `true` cuando el viewport mide al menos `px` de ancho. Reactivo; sin
 * matchMedia (SSR, tests) devuelve `false`, o sea el layout angosto.
 */
export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(query).matches),
  )

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const media = window.matchMedia(query)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    media.addEventListener('change', onChange)
    setMatches(media.matches)
    return () => media.removeEventListener('change', onChange)
  }, [query])

  return matches
}
