import { ApiError } from '../lib/api.js'

/**
 * Por qué falló un pedido de la puerta (resolver un QR o admitir un ingreso).
 *
 * `api.js` envuelve toda caída de red o timeout en un `ApiError` con
 * `status: 0`, nunca deja pasar el `TypeError` de `fetch`. Mirar sólo
 * `instanceof TypeError` hacía que el modo offline no arrancara jamás con un
 * corte real, y que un 429 o un 5xx se leyeran como "credencial no encontrada".
 *
 * - `network`: no hubo respuesta (sin señal, timeout, API caída).
 * - `rate_limited` / `server`: respondió, pero no es un veredicto sobre el QR.
 * - `auth`: la sesión del puesto venció o no alcanza el permiso.
 * - `not_found` / `rejected`: veredictos reales del servidor (404 y 409).
 */
export function classifyCheckinFailure(error) {
  if (error instanceof TypeError || error?.name === 'AuthRetryableFetchError') return 'network'
  if (!(error instanceof ApiError)) return 'other'
  const { status } = error
  if (status === 0 || status === 408) return 'network'
  if (status === 401 || status === 403) return 'auth'
  if (status === 404) return 'not_found'
  if (status === 409) return 'rejected'
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'server'
  return 'other'
}

/** El pedido puede reintentarse o resolverse con la lista local sin mentirle al operador. */
export function isRetryableCheckinFailure(error) {
  return ['network', 'rate_limited', 'server'].includes(classifyCheckinFailure(error))
}

/**
 * Un 409 del check-in sólo significa "alguien ya lo hizo pasar" cuando es
 * PLU06. Vencido, no vigente, zona incorrecta o sin pago también llegan como
 * 409 y NO son un conflicto de carrera entre dispositivos.
 */
export function isAlreadyAdmittedConflict(error) {
  const code = error?.body?.code
  if (code) return code === 'PLU06'
  return Boolean(error?.body?.alreadyUsed)
}
