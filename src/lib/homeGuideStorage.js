const HOME_GUIDE_STORAGE_KEY = 'plu-home-guide-seen'

export function hasSeenHomeGuide() {
  try {
    return window.localStorage.getItem(HOME_GUIDE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function markHomeGuideSeen() {
  try {
    window.localStorage.setItem(HOME_GUIDE_STORAGE_KEY, '1')
  } catch {
    // Modo privado o storage bloqueado: no insistimos.
  }
}
