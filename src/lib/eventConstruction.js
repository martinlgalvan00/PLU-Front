/**
 * Escena interactiva de "plataforma en construcción" — reglas puras.
 *
 * El visitante carga una barra olímpica con discos mientras espera. Es un
 * juguete: el peso es el de sus discos, no un avance de la obra, así que no se
 * muestra ningún porcentaje ni fecha.
 */

export const BAR_KG = 20

/** Discos de cada lado, en el orden en que se cargan (siempre en pares). */
export const PLATE_STACK = Object.freeze([20, 20, 15, 10, 5])
export const MAX_PLATES = PLATE_STACK.length

/** Discos que se ven de entrada cuando no hay animación. */
export const STATIC_PLATES = 3

/** Pausa entre disco y disco en la entrada automática. */
export const INTRO_STEP_MS = 520

export function clampPlates(count) {
  const value = Math.trunc(Number(count))
  if (!Number.isFinite(value)) return 0
  return Math.min(MAX_PLATES, Math.max(0, value))
}

/** Discos de un lado con `count` pares cargados. */
export function platesFor(count) {
  return PLATE_STACK.slice(0, clampPlates(count))
}

/** Peso total: la barra más los dos lados. */
export function loadedKg(count) {
  return BAR_KG + platesFor(count).reduce((sum, kg) => sum + kg, 0) * 2
}

/** Estado inicial: sin animación se muestra ya cargada a medias. */
export function initialPlates({ animated }) {
  return animated ? 0 : STATIC_PLATES
}
