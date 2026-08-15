import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

describe('Descartes de la cola de trabajo', () => {
  it('descarta un ítem de la cola mediante la API protegida', async () => {
    const staff = await buildStaffUser({ email: 'cola-dismiss@plu.test' })
    const dismiss = vi.fn().mockResolvedValue({
      itemKey: 'action-gate-42',
      itemType: 'registration_gate',
      dismissedBy: 'cola-dismiss@plu.test',
      dismissedAt: '2026-08-22T10:00:00.000Z',
    })
    const target = listen(createApp({
      prisma: createPrismaDouble([staff]),
      adminQueueRepository: { list: vi.fn(), dismiss, undismiss: vi.fn() },
      env: { AUTH_SECRET: 'admin-queue-dismiss-test-secret', APP_URL: 'http://localhost:5173' },
    }))

    try {
      const { cookie } = await loginStaff(target.url, { email: staff.email })
      const response = await fetch(`${target.url}/api/admin-queue`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ itemKey: 'action-gate-42', itemType: 'registration_gate' }),
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        dismissed: {
          itemKey: 'action-gate-42',
          itemType: 'registration_gate',
          dismissedBy: 'cola-dismiss@plu.test',
          dismissedAt: '2026-08-22T10:00:00.000Z',
        },
      })
      expect(dismiss).toHaveBeenCalledWith(
        'action-gate-42',
        'registration_gate',
        expect.stringContaining('cola-dismiss@plu.test'),
      )
    } finally {
      await target.close()
    }
  })

  it('restaura un ítem descartado', async () => {
    const staff = await buildStaffUser({ email: 'cola-undismiss@plu.test' })
    const undismiss = vi.fn().mockResolvedValue({ itemKey: 'action-gate-42', restored: true })
    const target = listen(createApp({
      prisma: createPrismaDouble([staff]),
      adminQueueRepository: { list: vi.fn(), dismiss: vi.fn(), undismiss },
      env: { AUTH_SECRET: 'admin-queue-undismiss-test-secret', APP_URL: 'http://localhost:5173' },
    }))

    try {
      const { cookie } = await loginStaff(target.url, { email: staff.email })
      const response = await fetch(`${target.url}/api/admin-queue/action-gate-42`, {
        method: 'DELETE',
        headers: authHeaders(cookie),
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ restored: { itemKey: 'action-gate-42', restored: true } })
      expect(undismiss).toHaveBeenCalledWith('action-gate-42', expect.stringContaining('cola-undismiss@plu.test'))
    } finally {
      await target.close()
    }
  })

  it('rechaza un payload de descarte inválido', async () => {
    const staff = await buildStaffUser({ email: 'cola-invalid@plu.test' })
    const dismiss = vi.fn()
    const target = listen(createApp({
      prisma: createPrismaDouble([staff]),
      adminQueueRepository: { list: vi.fn(), dismiss, undismiss: vi.fn() },
      env: { AUTH_SECRET: 'admin-queue-invalid-test-secret', APP_URL: 'http://localhost:5173' },
    }))

    try {
      const { cookie } = await loginStaff(target.url, { email: staff.email })
      const response = await fetch(`${target.url}/api/admin-queue`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ itemKey: '', itemType: 'registration_gate' }),
      })

      expect(response.status).toBe(400)
      expect(dismiss).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })
})
