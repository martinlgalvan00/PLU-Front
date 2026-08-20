/**
 * assistMode.js — PLU ARG
 *
 * Modo asistido: la lectura del sitio en escala grande, con la navegación
 * recortada a lo indispensable. Existe para las personas que se traban en los
 * trámites — mayoritariamente adultos mayores — y es una preferencia del
 * navegador, no del usuario logueado: se elige una vez y queda.
 *
 * Se aplica igual que el tema, con un atributo en `<html>`, para que una sola
 * hoja (`assist-mode.css`) pueda reescalar tipografía, targets y espaciado sin
 * duplicar ningún componente. Ver `AssistProvider`.
 */

export const ASSIST_STORAGE_KEY = 'plu-arg-assist'
export const ASSIST_ATTR = 'data-assist'

export function getStoredAssist() {
  try {
    return window.localStorage.getItem(ASSIST_STORAGE_KEY) === 'on'
  } catch {
    // Modo privado o storage bloqueado: el modo arranca apagado.
    return false
  }
}

export function applyAssist(enabled) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute(ASSIST_ATTR, enabled ? 'on' : 'off')
}

export function persistAssist(enabled) {
  try {
    window.localStorage.setItem(ASSIST_STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    // No persiste entre sesiones, pero la de ahora funciona igual.
  }
  applyAssist(enabled)
}

/** Se llama a nivel de módulo para que el atributo esté puesto antes del
 *  primer render: si esperara al efecto, la página se dibujaría una vez en
 *  escala normal y saltaría a la grande. */
export function initAssist() {
  const enabled = getStoredAssist()
  applyAssist(enabled)
  return enabled
}
