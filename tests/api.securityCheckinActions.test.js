import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { readSessionFromRequest } from '../server/services/sessionService.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

vi.mock('../server/services/sessionService.js', () => ({
  readSessionFromRequest: vi.fn(),
  extendSessionIfActive: vi.fn(),
}))

const EVENT_ID = 'a1111111-1111-4111-8111-111111111111'

function securitySession(id) {
  return { user: { id, email: `${id}@plu.test`, permissions: ['admin.checkin.execute'] } }
}

function appWith(repo) {
  return createApp({
    prisma: { securityZone: { findUnique: vi.fn().mockResolvedValue(null) } },
    ticketRepository: {
      verify: vi.fn(async (token) => ({
        ticket: { id: `ticket-${token}`, event_id: EVENT_ID, status: 'pagada' },
      })),
      checkIn: vi.fn(async (token) => ({ ticket: { qr_token: token }, checkIn: { id: 'in-1' } })),
      redeemAddon: vi.fn(async (token, addon) => ({ ticket: { qr_token: token, addon } })),
      ...repo,
    },
    env: { ...process.env, NODE_ENV: 'test' },
  })
}

async function post(server, path) {
  return fetch(`${server.url}${path}`, {
    method: 'POST',
    headers: { Origin: 'http://localhost:5173', 'X-PLU-Request': 'browser' },
  })
}

async function put(server, path, body) {
  return fetch(`${server.url}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', 'X-PLU-Request': 'browser' },
    body: JSON.stringify(body),
  })
}

afterEach(() => vi.restoreAllMocks())

describe('Seguridad: acciones sobre QR', () => {
  it.each(['seguridad-1', 'seguridad-2', 'seguridad-3'])(
    'cada cuenta de Seguridad con permiso puede registrar un ingreso (%s)',
    async (id) => {
      readSessionFromRequest.mockResolvedValue(securitySession(id))
      const app = appWith()
      const server = listen(app)
      try {
        const response = await post(server, `/api/tickets/checkin/token-${id}`)
        expect(response.status).toBe(200)
      } finally {
        await server.close()
      }
    },
  )

  it.each(['seguridad-1', 'seguridad-2', 'seguridad-3'])('cada cuenta de Seguridad puede canjear un adicional (%s)', async (id) => {
    readSessionFromRequest.mockResolvedValue(securitySession(id))
    const redeemAddon = vi.fn(async () => ({ ticket: { id: 'ticket-1' } }))
    const server = listen(appWith({ redeemAddon }))
    try {
      const response = await post(server, '/api/tickets/checkin/token-1/addons/food/redeem')
      expect(response.status).toBe(200)
      expect(redeemAddon).toHaveBeenCalledWith('token-1', 'food', `${id}:${id}@plu.test`)
    } finally {
      await server.close()
    }
  })

  it.each([
    ['todavía no vigente', '2026-08-15T13:00:00.000Z', '2026-08-15T14:00:00.000Z', 409],
    ['vencido', '2020-08-15T13:00:00.000Z', '2020-08-15T14:00:00.000Z', 409],
  ])('bloquea a Seguridad un QR %s', async (_label, validFrom, validUntil, expectedStatus) => {
    readSessionFromRequest.mockResolvedValue(securitySession('seguridad-1'))
    const server = listen(
      appWith({
        verify: async () => ({ ticket: { id: 'ticket-1', event_id: EVENT_ID, status: 'pagada', valid_from: validFrom, valid_until: validUntil } }),
      }),
    )
    try {
      const response = await post(server, '/api/tickets/checkin/token-1')
      expect(response.status).toBe(expectedStatus)
    } finally {
      await server.close()
    }
  })

  it('Seguridad no puede modificar la excepción individual de una entrada', async () => {
    readSessionFromRequest.mockResolvedValue(securitySession('seguridad-1'))
    const server = listen(appWith())
    try {
      const response = await put(server, '/api/tickets/a1111111-1111-4111-8111-111111111112/access-override', {
        enabled: true,
        validFrom: '2026-08-15T10:00:00.000Z',
        validUntil: '2026-08-15T20:00:00.000Z',
      })
      expect(response.status).toBe(403)
    } finally {
      await server.close()
    }
  })

  it('un administrador puede configurar una excepción individual validada', async () => {
    readSessionFromRequest.mockResolvedValue({ user: { id: 'admin-1', email: 'admin@plu.test', role: 'admin_maximal', permissions: ['admin.events.write', 'admin.checkin.execute'] } })
    const setAccessOverride = vi.fn(async () => ({ ticket: { id: 'a1111111-1111-4111-8111-111111111112' } }))
    const server = listen(appWith({ resolveTicketById: async () => ({ id: 'a1111111-1111-4111-8111-111111111112', event_id: EVENT_ID }), setAccessOverride }))
    try {
      const response = await put(server, '/api/tickets/a1111111-1111-4111-8111-111111111112/access-override', {
        enabled: true,
        validFrom: '2026-08-15T10:00:00.000Z',
        validUntil: '2026-08-15T20:00:00.000Z',
      })
      expect(response.status).toBe(200)
      expect(setAccessOverride).toHaveBeenCalled()
    } finally {
      await server.close()
    }
  })

  it('rechaza desde Admin una vigencia individual sin intervalo válido', async () => {
    readSessionFromRequest.mockResolvedValue({
      user: {
        id: 'admin-1',
        email: 'admin@plu.test',
        role: 'admin_maximal',
        permissions: ['admin.events.write', 'admin.checkin.execute'],
      },
    })
    const setAccessOverride = vi.fn()
    const server = listen(
      appWith({
        resolveTicketById: async () => ({ id: 'a1111111-1111-4111-8111-111111111112', event_id: EVENT_ID }),
        setAccessOverride,
      }),
    )
    try {
      const response = await put(server, '/api/tickets/a1111111-1111-4111-8111-111111111112/access-override', {
        enabled: true,
        validFrom: '2026-08-15T20:00:00.000Z',
        validUntil: '2026-08-15T10:00:00.000Z',
      })
      expect(response.status).toBe(400)
      expect(setAccessOverride).not.toHaveBeenCalled()
    } finally {
      await server.close()
    }
  })
})

describe('Seguridad: puesto que queda escrito en el ingreso', () => {
  async function checkInWithGate({ session, gate }) {
    readSessionFromRequest.mockResolvedValue(session)
    const checkIn = vi.fn(async (token) => ({ ticket: { qr_token: token }, checkIn: { id: 'in-1' } }))
    const server = listen(appWith({ checkIn }))
    try {
      const response = await fetch(`${server.url}/api/tickets/checkin/token-1`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:5173',
          'X-PLU-Request': 'browser',
        },
        body: JSON.stringify({ gate }),
      })
      expect(response.status).toBe(200)
      return checkIn.mock.calls[0][1]
    } finally {
      await server.close()
    }
  }

  it('con zona asignada manda el nombre de la zona, no lo que declare el dispositivo', async () => {
    const session = {
      user: {
        ...securitySession('seguridad-1').user,
        securityZone: { id: 'z1', name: 'Puerta 1', scope: 'gate_tickets' },
      },
    }
    expect(await checkInWithGate({ session, gate: 'Camarín VIP' })).toBe('Puerta 1')
  })

  it('sin zona usa el puesto declarado, sin caracteres de control y acotado', async () => {
    const session = securitySession('seguridad-2')
    const dirty = `Pesaje\u0000\n${'x'.repeat(200)}`
    const gate = await checkInWithGate({ session, gate: dirty })
    expect(gate.startsWith('Pesaje')).toBe(true)
    expect(gate).not.toMatch(/[\u0000-\u001f]/)
    expect(gate.length).toBeLessThanOrEqual(80)
  })

  it('sin zona ni puesto declarado cae en "Puerta"', async () => {
    expect(await checkInWithGate({ session: securitySession('seguridad-3'), gate: undefined })).toBe(
      'Puerta',
    )
    expect(await checkInWithGate({ session: securitySession('seguridad-3'), gate: 42 })).toBe(
      'Puerta',
    )
  })
})
