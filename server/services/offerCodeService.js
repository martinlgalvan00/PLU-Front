import { HttpError } from '../lib/errors.js'

/**
 * Modalidades de código que desbloquean algo en vez de descontar:
 *
 *   * 'access' — destraba el combo restringido sin tocar el precio.
 *   * 'offer'  — la oferta exclusiva: destraba Y fija el importe final.
 *
 * Un 'percent' o un 'fixed_price' se aplican en el checkout y no abren ninguna
 * pantalla, así que no entran acá. La lista vive en un solo lugar porque la
 * consultan tres cosas distintas: la puerta del combo, el canje de la llave y
 * la decisión de la UI de mostrar la ficha.
 */
export const OFFER_UNLOCK_KINDS = ['offer', 'access']

export function isOfferUnlockKind(kind) {
  return OFFER_UNLOCK_KINDS.includes(kind)
}

/**
 * Colapsa el motivo público de un código apagado al de uno inexistente.
 *
 * Distinguir `inactive` de `not_found` convertía el preview y el canje en un
 * oráculo de enumeración: cualquier respuesta distinta de "no existe" confirma
 * que el string probado es un código real. Un código pausado por el panel es,
 * para el público, indistinguible de uno que nunca existió; el motivo real
 * queda en la RPC y su auditoría, no en la respuesta.
 *
 * Los demás motivos (`expired`, `already_used`, `limit_reached`, …) se
 * conservan a propósito: exigen tener el código real en la mano y su valor de
 * UX es alto. Contra el barrido de diccionario alcanza con cerrar esta puerta
 * más el balde por IP (`promotionCodeLimiter`) y el corte por cuenta.
 */
export function concealInactiveReason(result) {
  if (result?.reason !== 'inactive') return result
  return { ...result, reason: 'not_found' }
}

/**
 * Alcance por inscripción sobre un preview.
 *
 * `athlete_preview_discount_code` no valida el alcance: no recibe el evento, y
 * agregárselo crearía un overload de una función que ya se versionó cinco veces
 * (ver la cabecera de 20260902100000). Devuelve `eventSlug` y acá se compara
 * contra el evento que se está cotizando — mismo criterio que el código del
 * combo, que también se valida en Express.
 *
 * Esto es UI, no seguridad: la guarda que no se puede eludir es la de
 * `apply_discount_code_to_order`, que compara contra el evento real de la orden
 * creada. Acá sólo se evita anunciar un ahorro que el canje va a rechazar.
 */
export function assertPreviewEventScope(preview, eventSlug) {
  if (!preview?.valid) return preview
  const scoped = preview.eventSlug ?? null
  if (!scoped) return preview
  if (eventSlug && scoped === eventSlug) return preview
  return {
    valid: false,
    reason: 'other_event',
    eventSlug: scoped,
    eventTitle: preview.eventTitle ?? null,
  }
}

/**
 * Misma verificación, en el camino de creación de la orden. Corta antes de
 * abrir la transacción para que el atleta reciba el motivo real en vez de un
 * PLU27 traducido a "no se pudo crear la orden".
 *
 * Redundante con la guarda de la RPC a propósito: acá gana el mensaje, allá
 * gana la integridad.
 */
export async function assertDiscountCodeEventScope(
  { previewDiscountCode, athleteId, code, appliesTo, baseAmount, eventSlug },
) {
  const candidate = String(code ?? '').trim()
  if (!candidate || typeof previewDiscountCode !== 'function') return
  let preview
  try {
    preview = await previewDiscountCode(athleteId, {
      code: candidate.toUpperCase(),
      appliesTo,
      baseAmount,
    })
  } catch {
    // Un preview que no se pudo consultar no bloquea la compra: la RPC vuelve a
    // validar el código entero dentro de la transacción.
    return
  }
  const scoped = preview?.eventSlug ?? null
  if (!scoped || !eventSlug || scoped === eventSlug) return
  throw new HttpError(403, 'Ese código es de otra inscripción.', {
    code: 'DISCOUNT_CODE_OTHER_EVENT',
    eventSlug: scoped,
  })
}
