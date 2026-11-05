import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Clave para el botón "Ver mi QR" del mail. No es el token del QR: firma la
 * referencia con el secreto del servidor. Quien tiene el mail ya tiene el PNG,
 * así que el enlace abre la misma entrada sin pedir el mail otra vez.
 * Sin la clave, la recuperación sigue siendo referencia + mail.
 */
const OPEN_LINK_PEPPER =
  process.env.TICKET_ORDER_TOKEN_SECRET || 'plu-staff-ticket-order-v1'

export function signTicketOpenKey(reference, secret = OPEN_LINK_PEPPER) {
  const value = String(reference ?? '').trim()
  if (!value || !secret) return null
  return createHmac('sha256', secret).update(`ticket-open:${value}`).digest('base64url')
}

export function ticketOpenKeyMatches(reference, key, secret = OPEN_LINK_PEPPER) {
  const expected = signTicketOpenKey(reference, secret)
  const given = String(key ?? '')
  if (!expected || !given) return false
  const left = Buffer.from(expected)
  const right = Buffer.from(given)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/**
 * El listado de staff ya ve el QR. Acá se suma la misma clave del mail para
 * que "copiar enlace" abra la entrada sin pedir el mail. No va en respuestas
 * públicas: sólo filas pagas, y la misma referencia comparte una sola firma.
 */
export function attachStaffBuyerOpenKeys(rows) {
  const keys = new Map()
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const order = row?.order
    const reference = String(order?.reference ?? '').trim()
    if (!order || !reference || row?.ticket?.status !== 'pagada') return row
    let openKey = keys.get(reference)
    if (openKey === undefined) {
      openKey = signTicketOpenKey(reference)
      keys.set(reference, openKey)
    }
    if (!openKey) return row
    return { ...row, order: { ...order, openKey } }
  })
}

/** Agrega `k` al enlace de entradas. Si ya está, lo deja igual. */
export function withSignedTicketOpenUrl(ticketUrl, reference) {
  const url = String(ticketUrl ?? '')
  const ref = String(reference ?? '').trim()
  if (!url || !ref || /[?&]k=/.test(url)) return url
  const key = signTicketOpenKey(ref)
  if (!key) return url
  return `${url}${url.includes('?') ? '&' : '?'}k=${encodeURIComponent(key)}`
}
