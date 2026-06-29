export const THEME_STORAGE_KEY = 'plu-arg-theme'

export const THEMES = ['dark', 'light']

export function getStoredTheme() {
  if (typeof window === 'undefined') return 'dark'
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  return THEMES.includes(stored) ? stored : null
}

export function getSystemTheme() {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function resolveTheme(preference = 'system') {
  if (preference === 'system') return getStoredTheme() ?? getSystemTheme()
  return THEMES.includes(preference) ? preference : 'dark'
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.style.colorScheme = theme
}

export function persistTheme(theme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme)
  applyTheme(theme)
}

export function initTheme() {
  const theme = resolveTheme('system')
  applyTheme(theme)
  return theme
}
