/**
 * Por qué no abrió la cámara de la puerta. Todo `getUserMedia` caído se
 * reportaba como "permiso denegado": quien tenía la cámara tomada por otra
 * pestaña o un equipo sin cámara trasera recibía la instrucción de revisar
 * permisos que ya estaban bien.
 *
 * - `permission`: el navegador o el usuario la bloquearon.
 * - `missing`: no hay cámara que cumpla lo pedido.
 * - `busy`: otra app o pestaña la tiene tomada, o el hardware no arrancó.
 * - `unknown`: cualquier otra cosa; se ofrece reintentar.
 */
export function classifyCameraError(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return 'permission'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'missing'
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy'
    default:
      return 'unknown'
  }
}

/** Sólo `busy` y `unknown` pueden arreglarse reintentando. */
export function isCameraErrorRetryable(kind) {
  return kind === 'busy' || kind === 'unknown'
}
