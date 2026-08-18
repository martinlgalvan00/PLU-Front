import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

describe('CRUD administrativo de tandas privadas', () => {
  // El panel (`RegistrationAccessSection.jsx`) siempre manda `eventSlug: ''`
  // para la tanda de afiliación -- no tiene torneo. El schema exigía al menos
  // 1 caracter incluso en un campo opcional, así que cualquier guardado de la
  // tanda de afiliación (alta o reapertura) rebotaba con un 400 en inglés.
  it('reabre la tanda de afiliación aunque el panel mande eventSlug vacío', async () => {
    const staff = await buildStaffUser({ email: 'tandas-reopen@plu.test' })
    const save = vi.fn().mockResolvedValue({
      id: 'gate-membership-1',
      scope: 'membership',
      label: 'Afiliación restringida',
      active: true,
      startsAt: null,
      endsAt: null,
    })
    const target = listen(
      createApp({
        prisma: createPrismaDouble([staff]),
        registrationAccessRepository: { list: vi.fn(), save, remove: vi.fn() },
        env: {
          AUTH_SECRET: 'registration-access-admin-test-secret',
          APP_URL: 'http://localhost:5173',
        },
      }),
    )

    try {
      const { cookie } = await loginStaff(target.url, { email: staff.email })
      const response = await fetch(`${target.url}/api/registration-access`, {
        method: 'PUT',
        headers: authHeaders(cookie),
        body: JSON.stringify({
          scope: 'membership',
          eventSlug: '',
          label: 'Afiliación restringida',
          active: true,
          startsAt: '',
          endsAt: '',
          code: 'NUEVA-TANDA-2026',
        }),
      })

      expect(response.status).toBe(200)
      expect(save).toHaveBeenCalledOnce()
      expect(save.mock.calls[0][0].eventSlug).toBeUndefined()
    } finally {
      await target.close()
    }
  })

  it('elimina una tanda mediante la API protegida y conserva la auditoría en Supabase', async () => {
    const staff = await buildStaffUser({ email: 'tandas-admin@plu.test' })
    const remove = vi.fn().mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' })
    const target = listen(
      createApp({
        prisma: createPrismaDouble([staff]),
        registrationAccessRepository: { list: vi.fn(), save: vi.fn(), remove },
        env: {
          AUTH_SECRET: 'registration-access-admin-test-secret',
          APP_URL: 'http://localhost:5173',
        },
      }),
    )

    try {
      const { cookie } = await loginStaff(target.url, { email: staff.email })
      const gateId = '11111111-1111-4111-8111-111111111111'
      const response = await fetch(`${target.url}/api/registration-access/${gateId}`, {
        method: 'DELETE',
        headers: authHeaders(cookie),
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ deletedGate: { id: gateId } })
      expect(remove).toHaveBeenCalledWith(gateId, expect.stringContaining('tandas-admin@plu.test'))
    } finally {
      await target.close()
    }
  })

  it('rechaza un identificador de tanda inválido', async () => {
    const staff = await buildStaffUser({ email: 'tandas-admin-invalid@plu.test' })
    const remove = vi.fn()
    const target = listen(
      createApp({
        prisma: createPrismaDouble([staff]),
        registrationAccessRepository: { list: vi.fn(), save: vi.fn(), remove },
        env: {
          AUTH_SECRET: 'registration-access-admin-test-secret',
          APP_URL: 'http://localhost:5173',
        },
      }),
    )

    try {
      const { cookie } = await loginStaff(target.url, { email: staff.email })
      const response = await fetch(`${target.url}/api/registration-access/no-es-uuid`, {
        method: 'DELETE',
        headers: authHeaders(cookie),
      })

      expect(response.status).toBe(400)
      expect(remove).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })
})
