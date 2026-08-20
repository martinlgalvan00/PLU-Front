import { HttpError } from '../lib/errors.js'
import { isOfferUnlockKind } from './offerCodeService.js'
import { verifyPassword } from './passwordService.js'

export function normalizeRegistrationAccessCode(value) {
  return String(value ?? '').trim()
}

export async function resolveRegistrationAccessRequirements(repository, { eventSlug = null } = {}) {
  const membershipGate = await repository.findActiveGate({ scope: 'membership' })
  const registrationGate = eventSlug
    ? await repository.findActiveGate({ scope: 'registration', eventSlug })
    : null

  return {
    membership: Boolean(membershipGate),
    registration: Boolean(registrationGate),
  }
}

/**
 * Combo restringido: el paquete existe pero sólo lo compra quien tiene el
 * código (`event_combo_offers.audience = 'code'`).
 *
 * No es un cupón —no toca el precio, habilita la compra— ni una tanda: la tanda
 * guarda un hash bcrypt porque es una contraseña de apertura que nadie vuelve a
 * leer, y este código se reparte, así que el panel lo muestra en claro. Lo que
 * sí comparte con la tanda es dónde se valida: acá, antes de crear la orden,
 * porque el checkout de combo tiene una sola puerta de entrada.
 *
 * La comparación es sobre el texto normalizado, no `===` crudo: el atleta lo
 * copia y pega de un mensaje y llega con espacios o en minúscula.
 */
export function assertComboAccessCode(offer, code) {
  if (offer?.audience === 'private') {
    throw new HttpError(404, 'El combo no está disponible.', {
      code: 'COMBO_PRIVATE',
    })
  }
  if (offer?.audience !== 'code') return null
  const expected = normalizeRegistrationAccessCode(offer.accessCode)
  const candidate = normalizeRegistrationAccessCode(code)
  if (!candidate) {
    throw new HttpError(403, 'Este combo requiere un código de acceso.', {
      code: 'COMBO_ACCESS_CODE_REQUIRED',
    })
  }
  if (!expected || candidate.toUpperCase() !== expected.toUpperCase()) {
    throw new HttpError(403, 'El código del combo no es válido.', {
      code: 'COMBO_ACCESS_CODE_INVALID',
    })
  }
  return offer
}

/**
 * Un `discount_codes.kind = 'access'` no cambia el precio, pero es una prueba
 * de acceso tan válida como el `access_code` del evento (ver
 * `20260901100000_discount_code_access_kind.sql`). Un `kind = 'offer'` —la
 * oferta exclusiva de `20260902100000`— también destraba, y además fija el
 * importe: el desbloqueo y el precio son el mismo objeto.
 *
 * Se resuelve con un preview (no redime): la redención real la hace
 * `apply_discount_code_to_order` al confirmarse el checkout, dentro de la misma
 * transacción que crea la orden — acá sólo se decide si destraba el paquete.
 *
 * `eventSlug` se compara cuando el código declara alcance de inscripción: sin
 * esto, un código de oferta de un torneo destrabaría el combo restringido de
 * otro. La guarda definitiva sigue siendo la de la RPC, que compara contra el
 * evento real de la orden.
 */
async function discountCodeGrantsComboAccess(
  previewDiscountCode,
  athleteId,
  code,
  baseAmount,
  eventSlug,
) {
  const candidate = normalizeRegistrationAccessCode(code)
  if (!candidate || typeof previewDiscountCode !== 'function') return false
  try {
    const preview = await previewDiscountCode(athleteId, {
      code: candidate.toUpperCase(),
      appliesTo: 'combo',
      baseAmount,
    })
    if (!preview?.valid || !isOfferUnlockKind(preview.kind)) return false
    if (preview.eventSlug && preview.eventSlug !== eventSlug) return false
    return true
  } catch {
    return false
  }
}

/**
 * Acepta el `access_code` del evento o un código de descuento `kind='access'`
 * (`applies_to = 'combo'`) como prueba de acceso al combo — cualquiera de
 * los dos campos que llegue del checkout (`comboAccessCode`/`discountCode`)
 * puede traer cualquiera de los dos tipos, porque el atleta puede pegar el
 * código en el campo que le resulte familiar. Si ninguno resuelve, relanza el
 * mismo error que tira `assertComboAccessCode` para no duplicar los mensajes.
 */
export async function assertComboAccessCodeOrDiscountCode(
  offer,
  { comboAccessCode, discountCode, previewDiscountCode, athleteId, baseAmount, eventSlug = null },
) {
  if (offer?.audience === 'private') {
    throw new HttpError(404, 'El combo no está disponible.', {
      code: 'COMBO_PRIVATE',
    })
  }
  if (offer?.audience !== 'code') return null

  const expected = normalizeRegistrationAccessCode(offer.accessCode).toUpperCase()
  const candidates = [comboAccessCode, discountCode]
    .map((value) => normalizeRegistrationAccessCode(value))
    .filter(Boolean)

  if (expected && candidates.some((candidate) => candidate.toUpperCase() === expected)) {
    return offer
  }

  for (const candidate of candidates) {
    if (
      await discountCodeGrantsComboAccess(
        previewDiscountCode,
        athleteId,
        candidate,
        baseAmount,
        eventSlug,
      )
    ) {
      return offer
    }
  }

  // Ningún candidato sirvió: relanza vía assertComboAccessCode para no
  // duplicar los mensajes, con el primer campo que haya traído algo — así
  // "no es válido" sale cuando lo que falló fue un discountCode, en vez de
  // "hace falta un código" sólo porque comboAccessCode vino vacío.
  return assertComboAccessCode(offer, comboAccessCode || discountCode)
}

export async function assertRegistrationAccessCode(repository, { scope, eventSlug = null, code }) {
  const gate = await repository.findActiveGate({ scope, eventSlug })
  if (!gate) return null

  const candidate = normalizeRegistrationAccessCode(code)
  if (!candidate) {
    throw new HttpError(403, 'Esta tanda requiere un código de habilitación.', {
      code: 'REGISTRATION_ACCESS_CODE_REQUIRED',
      scope,
    })
  }

  if (!(await verifyPassword(candidate, gate.code_hash))) {
    throw new HttpError(403, 'El código de habilitación no es válido.', {
      code: 'REGISTRATION_ACCESS_CODE_INVALID',
      scope,
    })
  }

  return gate
}
