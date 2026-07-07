import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { applyTheme, persistTheme, resolveTheme, THEME_STORAGE_KEY, THEMES } from '../lib/theme.js'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => resolveTheme('system'))

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

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
        if (!THEMES.includes(next)) return
        persistTheme(next)
        setThemeState(next)
      },
      toggleTheme() {
        const next = theme === 'dark' ? 'light' : 'dark'
        // View Transition API — cross-fade premium (Chrome 111+)
        if (typeof document.startViewTransition === 'function') {
          document.startViewTransition(() => {
            persistTheme(next)
            setThemeState(next)
          })
        } else {
          persistTheme(next)
          setThemeState(next)
        }
      },
    }),
    [theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider')
  return ctx
}
