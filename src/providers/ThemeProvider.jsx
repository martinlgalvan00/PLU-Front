/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { applyTheme, persistTheme, resolveTheme, THEME_STORAGE_KEY, THEMES } from '../lib/theme.js'

const ThemeContext = createContext(null)

/**
 * Marca en `<html>` que hay un cambio de tema en curso. Todo el CSS que
 * interpola colores de tema vive detrás de este atributo (ver base.css), así
 * que fuera de esta ventana no queda ninguna transición permanente
 * encareciendo hovers ni scroll.
 */
const TRANSITION_ATTR = 'data-theme-transition'

/** Debe cubrir la transición CSS más larga de la capa (--transition-theme). */
const CSS_TRANSITION_MS = 320

/**
 * Marca en `<html>` que la View Transition en curso es un revelado circular:
 * base.css apaga el fundido por defecto de `::view-transition-*(root)` para
 * que la única animación sea el círculo.
 */
const REVEAL_ATTR = 'data-theme-reveal'

/** Espejo de --motion-slow y --ease-cinematic (variables.css). */
const REVEAL_DURATION_MS = 480
const REVEAL_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)'

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Radio que cubre el viewport entero desde `origin`: la distancia a la
 * esquina más lejana. Con menos, el círculo terminaría antes de pintar todo y
 * el resto saltaría de golpe al final.
 */
function revealRadius({ x, y }) {
  return Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => resolveTheme('system'))
  const cssTransitionTimerRef = useRef(null)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(
    () => () => {
      if (cssTransitionTimerRef.current) window.clearTimeout(cssTransitionTimerRef.current)
    },
    [],
  )

  const changeTheme = useCallback((next, origin = null) => {
    // Reduced motion: cambio instantáneo, sin View Transition ni fade CSS.
    if (prefersReducedMotion()) {
      persistTheme(next)
      setThemeState(next)
      return
    }

    // View Transition API: el navegador cruza un snapshot del documento. Es la
    // ruta buena donde existe (Chrome 111+, Safari 18+) y no necesita el
    // fallback CSS — tener las dos activas animaba lo mismo dos veces.
    //
    // `flushSync` hace que lo que React pinta según el tema (el ícono del
    // toggle, logos por tema) ya esté en el DOM cuando el navegador toma el
    // snapshot nuevo; si no, aparecía de golpe después del cruce.
    if (typeof document.startViewTransition === 'function') {
      const root = document.documentElement
      // Con origen (el toggle que se tocó) el tema nuevo se abre en círculo
      // desde ahí: el cambio se lee como respuesta a ese botón y no como un
      // parpadeo de toda la pantalla. Sin origen, el fundido de base.css.
      if (origin) root.setAttribute(REVEAL_ATTR, '')
      const transition = document.startViewTransition(() => {
        flushSync(() => {
          persistTheme(next)
          setThemeState(next)
        })
      })
      if (origin) {
        transition.ready
          .then(() => {
            root.animate(
              {
                clipPath: [
                  `circle(0px at ${origin.x}px ${origin.y}px)`,
                  `circle(${revealRadius(origin)}px at ${origin.x}px ${origin.y}px)`,
                ],
              },
              {
                duration: REVEAL_DURATION_MS,
                easing: REVEAL_EASING,
                pseudoElement: '::view-transition-new(root)',
              },
            )
          })
          .catch(() => {})
        transition.finished.finally(() => root.removeAttribute(REVEAL_ATTR))
      }
      return
    }

    // Fallback (Firefox y navegadores viejos): se prende el atributo, se cambia
    // el tema y se apaga al terminar el cruce.
    const root = document.documentElement
    if (cssTransitionTimerRef.current) window.clearTimeout(cssTransitionTimerRef.current)
    root.setAttribute(TRANSITION_ATTR, '')
    persistTheme(next)
    setThemeState(next)
    cssTransitionTimerRef.current = window.setTimeout(() => {
      root.removeAttribute(TRANSITION_ATTR)
      cssTransitionTimerRef.current = null
    }, CSS_TRANSITION_MS)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)')
    function onChange() {
      const stored = localStorage.getItem(THEME_STORAGE_KEY)
      if (!stored) setThemeState(media.matches ? 'light' : 'dark')
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const value = useMemo(
    () => ({
      theme,
      setTheme(next) {
        if (!THEMES.includes(next) || next === theme) return
        changeTheme(next)
      },
      /** @param {{ x: number, y: number } | null} [origin] punto del viewport desde donde se revela el tema nuevo */
      toggleTheme(origin = null) {
        changeTheme(theme === 'dark' ? 'light' : 'dark', origin)
      },
    }),
    [changeTheme, theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider')
  return ctx
}
