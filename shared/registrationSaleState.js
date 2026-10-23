/**
 * Venta de inscripciones de un evento — PLU ARG
 *
 * Una sola respuesta a "¿se puede inscribir alguien ahora, y si no, por qué?".
 * La usan el panel (control de venta), el sitio (botón "Inscribirme") y el
 * servidor (el bloqueo de "Solo anuncio" en el checkout), así que los tres
 * dicen lo mismo.
 *
 * El estado guardado del evento (`status`) ya no se elige a mano: se deriva de
 * lo que decide el staff (abrir ahora, programar, cerrar) más la ventana de
 * fechas. Esta función es la lectura de esa combinación.
 *
 * Estados, en el orden en que se evalúan:
 *   - `ended`      el evento terminó (`finalizado`).
 *   - `sold_out`   sin cupo (`agotado`, o inscriptos >= cupo).
 *   - `closed`     el staff no la abrió todavía o la cerró, o la ventana venció.
 *   - `scheduled`  abierta con fecha de apertura por delante: abre sola.
 *   - `blocked`    abierta y en fecha, pero algo impide cobrar (`blockers`).
 *   - `on_sale`    se puede inscribir y pagar.
 *
 * Sin dependencias: corre igual en el navegador y en Node (server/).
 */

export const OPEN_REGISTRATION_STATUSES = Object.freeze(['inscripcion_abierta', 'cupos_limitados'])

export const REGISTRATION_SALE_STATES = Object.freeze([
  'ended',
  'sold_out',
  'closed',
  'scheduled',
  'blocked',
  'on_sale',
])

/**
 * Lo que impide vender aunque la inscripción esté abierta y en fecha, en el
 * orden en que conviene resolverlo.
 */
export const REGISTRATION_SALE_BLOCKERS = Object.freeze([
  'hidden',
  'announceOnly',
  'platformPaused',
  'noPaymentChannel',
])

/** `charge` (cobra) salvo que el evento esté explícitamente en "Solo anuncio". */
export function isAnnounceOnly(salesIntent) {
  return salesIntent === 'announce'
}

function toDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function isFull(event) {
  if (event?.status === 'agotado') return true
  const slots = Number(event?.slots)
  const registered = Number(event?.registered)
  return Number.isFinite(slots) && slots > 0 && Number.isFinite(registered) && registered >= slots
}

/**
 * @param {object|null|undefined} event evento en camelCase (`status`, `published`,
 *   `registrationOpensAt`, `registrationClosesAt`, `salesIntent`, `slots`, `registered`)
 * @param {{
 *   now?: Date|number,
 *   platform?: { checkoutEnabled?: boolean, registrationEnabled?: boolean } | null,
 *   registrationChannels?: string[] | null,
 * }} [options] `registrationChannels`: medios de cobro abiertos para la
 *   inscripción de este evento; `null` = no se sabe (no se evalúa).
 * @returns {{
 *   state: 'ended'|'sold_out'|'closed'|'scheduled'|'blocked'|'on_sale',
 *   reason: string|null,
 *   blockers: string[],
 *   opensAt: Date|null,
 *   closesAt: Date|null,
 *   canSell: boolean,
 * }}
 */
export function resolveRegistrationSale(event, options = {}) {
  const { platform = null, registrationChannels = null } = options
  const now = toDate(options.now ?? new Date()) ?? new Date()
  const status = event?.status ?? 'proximamente'
  const opensAt = toDate(event?.registrationOpensAt)
  const closesAt = toDate(event?.registrationClosesAt)
  const result = (state, reason = null, blockers = []) => ({
    state,
    reason,
    blockers,
    opensAt,
    closesAt,
    canSell: state === 'on_sale',
  })

  if (!event) return result('closed', 'notOpened')
  if (status === 'finalizado') return result('ended')
  if (isFull(event)) return result('sold_out')
  if (!OPEN_REGISTRATION_STATUSES.includes(status)) {
    return result('closed', status === 'cerrado' ? 'closedByStaff' : 'notOpened')
  }
  if (closesAt && now > closesAt) return result('closed', 'windowEnded')

  // Lo que va a impedir cobrar: también se informa estando programada, para
  // que se arregle antes de que llegue la hora de apertura.
  const blockers = []
  if (event.published !== true) blockers.push('hidden')
  if (isAnnounceOnly(event.salesIntent)) blockers.push('announceOnly')
  if (platform && (platform.checkoutEnabled === false || platform.registrationEnabled === false)) {
    blockers.push('platformPaused')
  }
  if (Array.isArray(registrationChannels) && registrationChannels.length === 0) {
    blockers.push('noPaymentChannel')
  }

  if (opensAt && now < opensAt) return result('scheduled', null, blockers)
  if (blockers.length > 0) return result('blocked', blockers[0], blockers)
  return result('on_sale')
}

/**
 * Lo que decide el staff, como se guarda: estado + ventana. Es la escritura
 * inversa de `resolveRegistrationSale` y la comparten el alta, el editor y el
 * control de venta.
 *
 *   - `open`       abre ya: estado abierto, sin apertura pendiente y, si la
 *                  ventana de cierre ya venció, sin cierre (si no, no abriría).
 *   - `scheduled`  abre sola en `opensAt`.
 *   - `closed`     la cierra el staff.
 *   - `soon`       todavía no se abrió (anunciada como próxima).
 *   - `ended`      el evento terminó.
 *
 * @returns {{ status: string, registrationOpensAt?: string|null, registrationClosesAt?: string|null }}
 *   solo las claves que cambian; `null` borra la fecha.
 */
export function registrationSalePatch(mode, { event = null, opensAt = null, now = new Date() } = {}) {
  const current = toDate(now) ?? new Date()
  if (mode === 'open') {
    const patch = { status: 'inscripcion_abierta' }
    const eventOpensAt = toDate(event?.registrationOpensAt)
    const eventClosesAt = toDate(event?.registrationClosesAt)
    if (eventOpensAt && eventOpensAt > current) patch.registrationOpensAt = null
    if (eventClosesAt && eventClosesAt < current) patch.registrationClosesAt = null
    return patch
  }
  if (mode === 'scheduled') {
    const date = toDate(opensAt)
    if (!date) throw new Error('Falta la fecha de apertura.')
    const patch = { status: 'inscripcion_abierta', registrationOpensAt: date.toISOString() }
    // Un cierre anterior a la nueva apertura dejaría una ventana imposible.
    const eventClosesAt = toDate(event?.registrationClosesAt)
    if (eventClosesAt && eventClosesAt <= date) patch.registrationClosesAt = null
    return patch
  }
  if (mode === 'closed') return { status: 'cerrado' }
  if (mode === 'ended') return { status: 'finalizado' }
  return { status: 'proximamente' }
}
