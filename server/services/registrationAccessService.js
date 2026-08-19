import { HttpError } from '../lib/errors.js'
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
