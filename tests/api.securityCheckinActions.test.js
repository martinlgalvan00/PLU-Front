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

  it('acredita con la lectura corta y no vuelve a verificar el QR', async () => {
    readSessionFromRequest.mockResolvedValue(securitySession('seguridad-1'))
    const verify = vi.fn()
    const checkIn = vi.fn(async (token) => ({ ticket: { qr_token: token }, checkIn: { id: 'in-1' } }))
    const locateTicketForCheckIn = vi.fn(async () => ({
      id: 'ticket-1',
      event_id: EVENT_ID,
      valid_from: '2020-01-01T00:00:00.000Z',
      valid_until: '2099-01-01T00:00:00.000Z',
    }))
    const server = listen(appWith({ verify, checkIn, locateTicketForCheckIn }))
    try {
      const response = await post(server, '/api/tickets/checkin/token-1')
      expect(response.status).toBe(200)
      expect(locateTicketForCheckIn).toHaveBeenCalledWith('token-1')
      expect(verify).not.toHaveBeenCalled()
      expect(checkIn.mock.calls[0][0]).toBe('token-1')
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

const ORDER_ID = 'b2222222-2222-4222-8222-222222222222'
const OTHER_EVENT = 'c3333333-3333-4333-8333-333333333333'

function postJson(server, path, body) {
  return fetch(`${server.url}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:5173',
      'X-PLU-Request': 'browser',
    },
    body: JSON.stringify(body),
  })
}

function orderClient(eventId) {
  return {
    from() {
      return {
        select() {
          return this
        },
        eq() {
          return this
        },
        maybeSingle: async () => ({ data: { event_id: eventId }, error: null }),
      }
    },
  }
}

describe('Puerta: habilitar entradas y forzar este ingreso', () => {
  it('habilita una orden de entradas con admin.tickets.enable', async () => {
    readSessionFromRequest.mockResolvedValue({
      user: { id: 'door-1', email: 'door@plu.test', permissions: ['admin.tickets.enable'] },
    })
    const approve = vi.fn(async () => ({ order: { id: ORDER_ID, status: 'aprobado' }, tickets: [] }))
    const server = listen(appWith({ approve }))
    try {
      const response = await postJson(server, `/api/tickets/orders/${ORDER_ID}/approve`, {
        overrideReason: 'Efectivo cobrado en puerta',
      })
      expect(response.status).toBe(200)
      expect(approve).toHaveBeenCalled()
    } finally {
      await server.close()
    }
  })

  it('niega habilitar una entrada sin el permiso de puerta ni el de finanzas', async () => {
    readSessionFromRequest.mockResolvedValue(securitySession('seguridad-1'))
    const approve = vi.fn()
    const server = listen(appWith({ approve }))
    try {
      const response = await postJson(server, `/api/tickets/orders/${ORDER_ID}/approve`, {})
      expect(response.status).toBe(403)
      expect(approve).not.toHaveBeenCalled()
    } finally {
      await server.close()
    }
  })

  it('niega habilitar una orden de otro evento', async () => {
    readSessionFromRequest.mockResolvedValue({
      user: {
        id: 'coord-1',
        email: 'coord@plu.test',
        eventScoped: true,
        eventAccess: [{ eventId: EVENT_ID, eventSlug: 'pitbull' }],
        permissions: ['admin.tickets.enable', 'admin.checkin.execute'],
      },
    })
    const approve = vi.fn()
    const server = listen(
      createApp({
        prisma: { securityZone: { findUnique: vi.fn().mockResolvedValue(null) } },
        supabaseAdmin: orderClient(OTHER_EVENT),
        ticketRepository: { approve },
        env: { ...process.env, NODE_ENV: 'test' },
      }),
    )
    try {
      const response = await postJson(server, `/api/tickets/orders/${ORDER_ID}/approve`, {
        overrideReason: 'No corresponde a este evento',
      })
      expect(response.status).toBe(403)
      expect(approve).not.toHaveBeenCalled()
    } finally {
      await server.close()
    }
  })

  it('fuerza la vigencia de una entrada paga y no el ingreso normal', async () => {
    readSessionFromRequest.mockResolvedValue({
      user: {
        id: 'door-1',
        email: 'door@plu.test',
        permissions: ['admin.checkin.execute', 'admin.checkin.override'],
      },
    })
    const checkIn = vi.fn()
    const checkInForce = vi.fn(async () => ({ ticket: { id: 'ticket-1' }, checkIn: { id: 'in-1' } }))
    const server = listen(
      appWith({
        verify: async () => ({
          ticket: {
            id: 'ticket-1',
            event_id: EVENT_ID,
            status: 'pagada',
            valid_from: '2099-01-01T00:00:00.000Z',
            valid_until: '2099-01-02T00:00:00.000Z',
          },
        }),
        checkIn,
        checkInForce,
      }),
    )
    try {
      const response = await postJson(server, '/api/tickets/checkin/token-1', {
        force: 'validity',
        reason: 'Llegó antes de la ventana',
      })
      expect(response.status).toBe(200)
      expect(checkInForce).toHaveBeenCalled()
      expect(checkIn).not.toHaveBeenCalled()
    } finally {
      await server.close()
    }
  })

  it('rechaza forzar sin motivo o sin permiso, y una entrada impaga', async () => {
    const door = {
      user: {
        id: 'door-1',
        email: 'door@plu.test',
        permissions: ['admin.checkin.execute', 'admin.checkin.override'],
      },
    }
    readSessionFromRequest.mockResolvedValue(door)
    const checkInForce = vi.fn()
    const upcoming = appWith({
      verify: async () => ({
        ticket: { id: 'ticket-1', event_id: EVENT_ID, status: 'pagada' },
      }),
      checkInForce,
    })
    const missingReason = listen(upcoming)
    try {
      const response = await postJson(missingReason, '/api/tickets/checkin/token-1', {
        force: 'validity',
      })
      expect(response.status).toBe(400)
      expect(checkInForce).not.toHaveBeenCalled()
    } finally {
      await missingReason.close()
    }

    readSessionFromRequest.mockResolvedValue(securitySession('seguridad-1'))
    const forbidden = listen(upcoming)
    try {
      const response = await postJson(forbidden, '/api/tickets/checkin/token-1', {
        force: 'zone',
        reason: 'Zona equivocada en el puesto',
      })
      expect(response.status).toBe(403)
    } finally {
      await forbidden.close()
    }

    readSessionFromRequest.mockResolvedValue(door)
    const unpaid = listen(
      appWith({
        verify: async () => ({
          ticket: { id: 'ticket-1', event_id: EVENT_ID, status: 'pendiente_pago' },
        }),
        checkInForce,
      }),
    )
    try {
      const response = await postJson(unpaid, '/api/tickets/checkin/token-1', {
        force: 'validity',
        reason: 'Todavía no pagó la entrada',
      })
      expect(response.status).toBe(409)
      expect(checkInForce).not.toHaveBeenCalled()
    } finally {
      await unpaid.close()
    }
  })

  it('la puerta no deja una vigencia permanente; el coordinador sí', async () => {
    readSessionFromRequest.mockResolvedValue({
      user: {
        id: 'door-1',
        email: 'door@plu.test',
        permissions: ['admin.checkin.execute', 'admin.checkin.override'],
      },
    })
    const setAccessOverride = vi.fn(async () => ({ ticket: { id: 'ticket-1' } }))
    const denied = listen(appWith({ setAccessOverride }))
    try {
      const response = await put(
        denied,
        '/api/tickets/a1111111-1111-4111-8111-111111111112/access-override',
        {
          enabled: true,
          validFrom: '2026-08-15T10:00:00.000Z',
          validUntil: '2026-08-15T20:00:00.000Z',
        },
      )
      expect(response.status).toBe(403)
      expect(setAccessOverride).not.toHaveBeenCalled()
    } finally {
      await denied.close()
    }

    readSessionFromRequest.mockResolvedValue({
      user: {
        id: 'coord-1',
        email: 'coord@plu.test',
        eventScoped: true,
        eventAccess: [{ eventId: EVENT_ID, eventSlug: 'pitbull' }],
        permissions: ['admin.checkin.override', 'admin.event_team.write', 'admin.checkin.execute'],
      },
    })
    const allowed = listen(
      appWith({
        resolveTicketById: async () => ({
          id: 'a1111111-1111-4111-8111-111111111112',
          event_id: EVENT_ID,
        }),
        setAccessOverride,
      }),
    )
    try {
      const response = await put(
        allowed,
        '/api/tickets/a1111111-1111-4111-8111-111111111112/access-override',
        {
          enabled: true,
          validFrom: '2026-08-15T10:00:00.000Z',
          validUntil: '2026-08-15T20:00:00.000Z',
        },
      )
      expect(response.status).toBe(200)
      expect(setAccessOverride).toHaveBeenCalled()
    } finally {
      await allowed.close()
    }
  })
})
