/* Guion de la barra cargada (segundos). Los discos se deslizan desde la punta de
   la manga; el tope entra detrás, se frena a unos píxeles y recién ahí se empuja
   contra los discos: ese es el momento de "ajustar" (contacto → los discos y la
   manga sienten el golpe → el seguro se cierra → la barra cede y se asienta).
   Lo consumen `BarbellLoad` (para animar) y quien necesite sincronizar texto o
   números con el golpe del tope. */

/** Discos visibles como máximo por manga: más de esto no se distingue. */
export const BARBELL_MAX_PLATES = 12

export const PLATE_SLIDE_S = 0.55
export const PLATE_FADE_S = 0.18
/** El tope arranca cuando el último disco ya casi apoyó. */
export const COLLAR_START_AFTER_LAST_PLATE_S = 0.44
export const COLLAR_APPROACH_S = 0.34
export const COLLAR_PUSH_S = 0.2
export const IMPACT_S = 0.72

/**
 * Cuándo ocurre cada hito de la secuencia, en segundos desde que se monta la
 * barra: el tope arranca (`collarStartAt`), aprieta contra los discos
 * (`contactAt`) y la barra termina de asentarse (`settledAt`).
 */
export function getBarbellTimeline(count, { delay = 0, stepMs = 260 } = {}) {
  const shown = Math.max(0, Math.min(count, BARBELL_MAX_PLATES))
  const step = stepMs / 1000
  const collarStartAt = delay + Math.max(shown - 1, 0) * step + COLLAR_START_AFTER_LAST_PLATE_S
  const contactAt = collarStartAt + COLLAR_APPROACH_S + COLLAR_PUSH_S
  return { collarStartAt, contactAt, settledAt: contactAt + IMPACT_S }
}
