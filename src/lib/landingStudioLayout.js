/**
 * Reglas puras del editor visual de la landing (sin React): cómo entra la
 * vista previa en el escenario y dónde cae un bloque arrastrado.
 */

/** Ancho real de cada dispositivo: la página se dibuja a ese ancho y se escala para entrar. */
export const STUDIO_DEVICE_WIDTHS = Object.freeze({ desktop: 1280, tablet: 768, mobile: 390 })

/** Aire alrededor del marco dentro del escenario. */
export const STUDIO_STAGE_PADDING = 24

/**
 * Escala que hace entrar un ancho de dispositivo en el escenario, sin agrandar
 * nunca la página (a lo sumo 1) ni achicarla hasta volverla ilegible.
 */
export function studioPreviewScale(stageWidth, deviceWidth) {
  if (!stageWidth || !deviceWidth) return 1
  return Math.min(1, Math.max(0.2, (stageWidth - STUDIO_STAGE_PADDING * 2) / deviceWidth))
}

/**
 * Posición final de un bloque soltado antes o después de otro, como el `delta`
 * que entiende `moveBlock` (que además deja la portada primera).
 */
export function dropDelta(blocks, dragId, targetId, after) {
  const from = blocks.findIndex((block) => block.id === dragId)
  const target = blocks.findIndex((block) => block.id === targetId)
  if (from === -1 || target === -1 || dragId === targetId) return 0
  let to = target + (after ? 1 : 0)
  if (from < to) to -= 1
  return to - from
}
