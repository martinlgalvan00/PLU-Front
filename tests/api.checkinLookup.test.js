import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

/**
 * Verificación por código en la puerta (`POST /api/tickets/checkin/lookup`) y
 * la forma del token en las rutas del QR. La búsqueda no decide nada: devuelve
 * la credencial para que el cliente siga por el carril del escaneo.
 */

const EVENT_ID = '11111111-1111-4111-8111-111111111111'
const MATCH = {
  kind: 'ticket',
  code: '6f1c1e0e-8f6b-4d7a-9a63-1d3b7b2a9c11',
  ticketCode: 'TCK-00000412',
  name: 'Ana Torres',
  document: '30111222',
  label: 'Entrada general',
  status: 'pagada',
}

async function withApp(run, { role = 'seguridad_plu_arg', repository = {} } = {}) {
  const staff = await buildStaffUser({ role, email: `${role}@lookup.test` })
  const repo = {
    resolveEventIdBySlug: vi.fn().mockResolvedValue(EVENT_ID),
    lookupCheckinCredentials: vi.fn().mockResolvedValue([MATCH]),
    verify: vi.fn(),
    checkIn: vi.fn(),
    ...repository,
  }
  const server = listen(
    createApp({
      prisma: createPrismaDouble([staff]),
      supabaseAdmin: null,
      ticketRepository: repo,
      platformSettingsRepository: { get: async () => ({}) },
      env: { ...process.env, NODE_ENV: 'test' },
    }),
  )
  try {
    const { cookie } = await loginStaff(server.url, { email: staff.email })
    const post = (path, body = {}) =>
      fetch(`${server.url}${path}`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify(body),
      })
    await run({ post, repo, server })
  } finally {
    await server.close()
  }
}

describe('POST /api/tickets/checkin/lookup', () => {
  it('seguridad busca por número de entrada dentro de su evento', async () => {
    await withApp(async ({ post, repo }) => {
      const response = await post('/api/tickets/checkin/lookup', {
        eventSlug: 'pitbull-classic-2026',
        ticketCode: 'tck-00000412',
      })
      expect(response.status).toBe(200)
      expect((await response.json()).matches).toEqual([MATCH])
      expect(repo.lookupCheckinCredentials).toHaveBeenCalledWith(EVENT_ID, {
        ticketCode: 'TCK-00000412',
        dni: null,
        doorCode: null,
      })
    })
  })

  it('busca por código de puerta de 6 dígitos', async () => {
    await withApp(async ({ post, repo }) => {
      const response = await post('/api/tickets/checkin/lookup', {
        eventSlug: 'pitbull-classic-2026',
        doorCode: '482 913',
      })
      expect(response.status).toBe(200)
      expect(repo.lookupCheckinCredentials).toHaveBeenCalledWith(EVENT_ID, {
        ticketCode: null,
        dni: null,
        doorCode: '482913',
      })
    })
  })

  it('normaliza el DNI con puntos', async () => {
    await withApp(async ({ post, repo }) => {
      const response = await post('/api/tickets/checkin/lookup', {
        eventSlug: 'pitbull-classic-2026',
        dni: '30.111.222',
      })
      expect(response.status).toBe(200)
      expect(repo.lookupCheckinCredentials).toHaveBeenCalledWith(EVENT_ID, {
        ticketCode: null,
        dni: '30111222',
        doorCode: null,
      })
    })
  })

  it.each([
    ['sin código ni DNI', { eventSlug: 'pitbull-classic-2026' }],
    [
      'con los dos a la vez',
      { eventSlug: 'pitbull-classic-2026', ticketCode: 'TCK-00000412', dni: '30111222' },
    ],
    ['un código mal formado', { eventSlug: 'pitbull-classic-2026', ticketCode: '412' }],
    ['un DNI corto', { eventSlug: 'pitbull-classic-2026', dni: '123' }],
    ['un código de puerta de 5 dígitos', { eventSlug: 'pitbull-classic-2026', doorCode: '48291' }],
    [
      'código de puerta y DNI a la vez',
      { eventSlug: 'pitbull-classic-2026', doorCode: '482913', dni: '30111222' },
    ],
  ])('rechaza %s sin consultar la base', async (_label, body) => {
    await withApp(async ({ post, repo }) => {
      const response = await post('/api/tickets/checkin/lookup', body)
      expect(response.status).toBe(400)
      expect(repo.lookupCheckinCredentials).not.toHaveBeenCalled()
    })
  })

  it('no responde a una cuenta sin permiso de puerta', async () => {
    await withApp(
      async ({ post, repo }) => {
        const response = await post('/api/tickets/checkin/lookup', {
          eventSlug: 'pitbull-classic-2026',
          dni: '30111222',
        })
        expect(response.status).toBe(403)
        expect(repo.lookupCheckinCredentials).not.toHaveBeenCalled()
      },
      { role: 'operador_plu_arg' },
    )
  })
})

describe('forma del token del QR', () => {
  it('un código que no es UUID es "no encontrada", no "sin servicio"', async () => {
    await withApp(async ({ post, repo, server }) => {
      const verify = await fetch(`${server.url}/api/tickets/verify/TCK-00000412`)
      expect(verify.status).toBe(404)
      const checkin = await post('/api/tickets/checkin/TCK-00000412')
      expect(checkin.status).toBe(404)
      expect(repo.verify).not.toHaveBeenCalled()
      expect(repo.checkIn).not.toHaveBeenCalled()
    })
  })
})
