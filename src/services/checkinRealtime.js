/**
 * El aviso de puerta solo trae el slug. `realtime.send` agrega `id`.
 * Cualquier otro campo (nombre, DNI, QR) se descarta: no se refresca.
 */
export function readCheckinBroadcastSlug(message) {
  const payload = message?.payload && typeof message.payload === 'object' ? message.payload : message
  const body = payload?.payload && typeof payload.payload === 'object' ? payload.payload : payload
  if (!body || typeof body !== 'object') return null
  const keys = Object.keys(body).filter((key) => key !== 'id')
  if (keys.length !== 1 || keys[0] !== 'eventSlug') return null
  return typeof body.eventSlug === 'string' && body.eventSlug ? body.eventSlug : null
}
