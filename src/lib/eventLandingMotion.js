/**
 * Animaciones de la landing de un evento — PLU ARG
 *
 * El staff elige cuánto se mueve la página del evento (`layout.motion`):
 *
 *   none  sin animaciones: todo aparece de una vez.
 *   soft  cada bloque entra con un fundido corto al llegar a la pantalla.
 *   bold  la portada entra en secuencia y los bloques suben con más recorrido.
 *
 * Solo anima `transform` y `opacity`, y `prefers-reduced-motion` lo apaga sin
 * importar lo que haya elegido el staff (ver `event-builder-landing.css`).
 */

export const LANDING_MOTION_PRESETS = Object.freeze(['none', 'soft', 'bold'])
export const DEFAULT_LANDING_MOTION = 'soft'

export const isLandingMotion = (value) => LANDING_MOTION_PRESETS.includes(value)

/** Preset válido o el de por defecto: un valor desconocido nunca rompe la página. */
export function normalizeLandingMotion(raw) {
  const value = String(raw ?? '').trim()
  return isLandingMotion(value) ? value : DEFAULT_LANDING_MOTION
}

/** ¿El staff eligió explícitamente algo distinto del preset por defecto? */
export function hasCustomLandingMotion(raw) {
  const value = String(raw ?? '').trim()
  return isLandingMotion(value) && value !== DEFAULT_LANDING_MOTION
}
