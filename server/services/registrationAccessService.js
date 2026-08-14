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

export async function assertRegistrationAccessCode(repository, {
  scope,
  eventSlug = null,
  code,
}) {
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
