import { describe, expect, it, vi } from 'vitest'
import {
  assertRegistrationAccessCode,
  resolveRegistrationAccessRequirements,
} from '../server/services/registrationAccessService.js'
import { hashPassword } from '../server/services/passwordService.js'

describe('tandas privadas de afiliación e inscripción', () => {
  it('no exige código cuando no hay una tanda activa', async () => {
    const repository = { findActiveGate: vi.fn().mockResolvedValue(null) }
    await expect(assertRegistrationAccessCode(repository, { scope: 'membership' })).resolves.toBeNull()
  })

  it('rechaza una afiliación sin código o con código incorrecto', async () => {
    const repository = {
      findActiveGate: vi.fn().mockResolvedValue({ id: 'gate-1', code_hash: await hashPassword('TANDA-PLU-2026') }),
    }

    await expect(assertRegistrationAccessCode(repository, { scope: 'membership' })).rejects.toMatchObject({
      status: 403,
      details: { code: 'REGISTRATION_ACCESS_CODE_REQUIRED' },
    })
    await expect(assertRegistrationAccessCode(repository, { scope: 'membership', code: 'otro-codigo' })).rejects.toMatchObject({
      status: 403,
      details: { code: 'REGISTRATION_ACCESS_CODE_INVALID' },
    })
  })

  it('habilita sólo el alcance cuyo código coincide', async () => {
    const membershipGate = { id: 'membership-1', scope: 'membership', code_hash: await hashPassword('AFILIACION-2026') }
    const eventGate = { id: 'event-1', scope: 'registration', code_hash: await hashPassword('PITBULL-2026') }
    const repository = {
      findActiveGate: vi.fn(({ scope }) => Promise.resolve(scope === 'membership' ? membershipGate : eventGate)),
    }

    await expect(assertRegistrationAccessCode(repository, {
      scope: 'membership', code: 'AFILIACION-2026',
    })).resolves.toBe(membershipGate)
    await expect(assertRegistrationAccessCode(repository, {
      scope: 'registration', eventSlug: 'pitbull-classic-2026', code: 'PITBULL-2026',
    })).resolves.toBe(eventGate)
  })

  it('informa separadamente qué código requiere un combo', async () => {
    const repository = {
      findActiveGate: vi.fn(({ scope }) => Promise.resolve(scope === 'membership' ? { id: 'm' } : { id: 'r' })),
    }
    await expect(resolveRegistrationAccessRequirements(repository, { eventSlug: 'pitbull-classic-2026' }))
      .resolves.toEqual({ membership: true, registration: true })
  })
})
