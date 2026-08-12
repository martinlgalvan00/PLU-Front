/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
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

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
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

  const changeTheme = useCallback((next) => {
    // Reduced motion: cambio instantáneo, sin View Transition ni fade CSS.
    if (prefersReducedMotion()) {
      persistTheme(next)
      setThemeState(next)
      return
    }

    // View Transition API: el navegador cruza un snapshot del documento. Es la
    // ruta buena donde existe (Chrome 111+, Safari 18+) y no necesita el
    // fallback CSS — tener las dos activas animaba lo mismo dos veces.
    if (typeof document.startViewTransition === 'function') {
      document.startViewTransition(() => {
        persistTheme(next)
        setThemeState(next)
      })
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
      toggleTheme() {
        changeTheme(theme === 'dark' ? 'light' : 'dark')
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
