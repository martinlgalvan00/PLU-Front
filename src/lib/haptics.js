/**
 * haptics.js — PLU ARG
 *
 * Vibración de confirmación para los momentos que cierran un trámite real:
 * afiliación acreditada, inscripción confirmada, pago aprobado. No se usa
 * para hover, foco, navegación ni errores — un teléfono que vibra por
 * cualquier cosa deja de significar nada.
 *
 * `navigator.vibrate` solo existe en Android/Chromium; en iOS no hay API web
 * equivalente y la llamada simplemente no ocurre. Todo el módulo es
 * best-effort: nunca lanza, nunca bloquea, nunca es la única señal de que algo
 * pasó (el estado siempre está también en pantalla y en `role="status"`).
 */

/** Patrón corto de dos golpes: acuse, no alarma. */
const CONFIRM_PATTERN = [14, 46, 22]

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Vibra una vez para acusar una confirmación. No hace nada si el dispositivo
 * no soporta vibración o si la persona pidió menos movimiento.
 * @returns {boolean} true si el navegador aceptó la vibración.
 */
export function celebrateHaptic() {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false
  if (prefersReducedMotion()) return false
  try {
    return navigator.vibrate(CONFIRM_PATTERN)
  } catch {
    // Algunos navegadores tiran por política de gesto de usuario: la
    // confirmación visual ya está en pantalla, no hay nada que recuperar.
    return false
  }
}
