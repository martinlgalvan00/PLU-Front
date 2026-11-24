/**
 * El editor visual sobrevive al guardado.
 *
 * Guardar un evento cierra y vuelve a armar el editor (el padre resetea el
 * borrador con lo que devolvió el servidor), y con él se desmontaba el editor
 * visual: quien guardaba a mitad de camino terminaba afuera. Antes de guardar
 * se marca el evento; el editor que se monta enseguida para ese mismo evento
 * vuelve a abrirlo. La marca vence sola para no reabrirlo más tarde, por
 * ejemplo si el guardado falló y el staff se fue a otra pestaña.
 */

const REOPEN_WINDOW_MS = 15_000

let pending = null

export function markLandingStudioForReopen(eventId, now = Date.now()) {
  pending = eventId ? { eventId, at: now } : null
}

/**
 * ¿El editor que se monta para `eventId` tiene que abrir el editor visual?
 * No consume la marca (los inicializadores de estado pueden correr dos veces en
 * modo estricto): la limpia `clearLandingStudioReopen` una vez abierto.
 */
export function shouldReopenLandingStudio(eventId, now = Date.now()) {
  if (!pending || !eventId) return false
  return pending.eventId === eventId && now - pending.at <= REOPEN_WINDOW_MS
}

export function clearLandingStudioReopen() {
  pending = null
}
