import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

const ENV = { AUTH_SECRET: 'compression-test-secret', APP_URL: 'http://localhost:5173' }

// El snapshot del panel es la respuesta mas pesada del sistema y el panel la
// repregunta cada minuto: sin compresion es la mayor parte del egress.
function bigQueueList() {
  return Array.from({ length: 400 }, (_, index) => ({
    itemKey: `gate-${index}`,
    itemType: 'registration_gate',
    dismissedBy: 'operador@plu.test',
    dismissedAt: '2026-08-22T10:00:00.000Z',
  }))
}

describe('compresion de las respuestas de la API', () => {
  it('comprime una respuesta grande cuando el cliente lo acepta', async () => {
    const staff = await buildStaffUser({ email: 'gzip@plu.test' })
    const target = listen(createApp({
      prisma: createPrismaDouble([staff]),
      adminQueueRepository: {
        list: vi.fn().mockResolvedValue(bigQueueList()),
        dismiss: vi.fn(),
        undismiss: vi.fn(),
      },
      env: ENV,
    }))

    try {
      const { cookie } = await loginStaff(target.url, { email: staff.email })
      const response = await fetch(`${target.url}/api/admin-queue`, {
        headers: { ...authHeaders(cookie), 'Accept-Encoding': 'gzip' },
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('content-encoding')).toBe('gzip')
      // `fetch` descomprime solo: el cuerpo tiene que seguir siendo el JSON.
      expect(await response.json()).toHaveLength(400)
    } finally {
      await target.close()
    }
  })

  it('no comprime cuando el cliente no lo acepta', async () => {
    const staff = await buildStaffUser({ email: 'sin-gzip@plu.test' })
    const target = listen(createApp({
      prisma: createPrismaDouble([staff]),
      adminQueueRepository: {
        list: vi.fn().mockResolvedValue(bigQueueList()),
        dismiss: vi.fn(),
        undismiss: vi.fn(),
      },
      env: ENV,
    }))

    try {
      const { cookie } = await loginStaff(target.url, { email: staff.email })
      const response = await fetch(`${target.url}/api/admin-queue`, {
        headers: { ...authHeaders(cookie), 'Accept-Encoding': 'identity' },
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('content-encoding')).toBeNull()
    } finally {
      await target.close()
    }
  })
})
