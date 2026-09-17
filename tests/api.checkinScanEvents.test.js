import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { readSessionFromRequest } from '../server/services/sessionService.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

vi.mock('../server/services/sessionService.js', () => ({
  readSessionFromRequest: vi.fn(),
  extendSessionIfActive: vi.fn(),
}))

const EVENT_ID = 'a1111111-1111-4111-8111-111111111111'
const OTHER_EVENT_TICKET_ID = 'c3333333-3333-4333-8333-333333333333'

function staffSession(overrides = {}) {
  return {
    user: {
      id: 'staff-1',
      email: 'staff@plu.test',
      permissions: ['admin.checkin.execute'],
      ...overrides,
    },
  }
}

/** Cliente Supabase de mentira: sólo junta lo que se intentó escribir. */
function supabaseWriteSpy() {
  const upserts = []
  const client = {
    from(table) {
      return {
        upsert(rows, options) {
          upserts.push({ table, rows, options })
          return { select: async () => ({ data: rows, error: null }) }
        },
      }
    },
  }
  return { client, upserts }
}

function buildApp({ ticketRepository, supabaseAdmin } = {}) {
  return createApp({
    prisma: {},
    supabaseAdmin,
    ticketRepository: {
      resolveEventIdBySlug: async () => EVENT_ID,
      resolveTicketByQrToken: async () => null,
      scanReport: async () => ({ summary: { total: 0 } }),
      ...ticketRepository,
    },
    env: { ...process.env, NODE_ENV: 'test' },
  })
}

async function post(server, path, body) {
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

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/tickets/checkin/scan-events', () => {
  it('ignora eventId, gate, zoneScope y actorLabel del cuerpo -- siempre salen de la cuenta', async () => {
    readSessionFromRequest.mockResolvedValue(
      staffSession({ securityZone: { name: 'Puerta norte' } }),
    )
    const { client, upserts } = supabaseWriteSpy()
    const app = buildApp({ supabaseAdmin: client })
    const server = listen(app)
    try {
      const response = await post(server, '/api/tickets/checkin/scan-events', {
        eventSlug: 'pitbull-classic-2026',
        deviceId: 'device-1',
        attempts: [
          {
            clientId: '11111111-1111-4111-8111-111111111111',
            scannedAt: new Date().toISOString(),
            kind: 'ticket',
            outcome: 'expired',
            // Todo esto, si se colara, sería la superficie de envenenamiento.
            eventId: 'evento-inventado',
            gate: 'Puerta inventada',
            zoneScope: 'zona inventada',
            actorLabel: 'otra persona',
          },
        ],
      })
      expect(response.status).toBe(202)
      expect(upserts).toHaveLength(1)
      const [row] = upserts[0].rows
      expect(row.event_id).toBe(EVENT_ID)
      expect(row.gate).toBe('Puerta norte')
      expect(row.actor_label).toContain('staff@plu.test')
      expect(row.evidence).toBe('operator')
      expect(row.outcome).toBe('expired')
    } finally {
      server.close()
    }
  })

  it('nunca guarda evidence server desde este endpoint, sólo operator', async () => {
    readSessionFromRequest.mockResolvedValue(staffSession())
    const { client, upserts } = supabaseWriteSpy()
    const app = buildApp({ supabaseAdmin: client })
    const server = listen(app)
    try {
      await post(server, '/api/tickets/checkin/scan-events', {
        eventSlug: 'pitbull-classic-2026',
        deviceId: 'device-1',
        attempts: [
          {
            clientId: '22222222-2222-4222-8222-222222222222',
            scannedAt: new Date().toISOString(),
            kind: 'ticket',
            outcome: 'checked_in',
          },
        ],
      })
      expect(upserts[0].rows[0].evidence).toBe('operator')
    } finally {
      server.close()
    }
  })

  it('sólo resuelve el ticketId cuando el token pertenece a ESTE evento', async () => {
    readSessionFromRequest.mockResolvedValue(staffSession())
    const { client, upserts } = supabaseWriteSpy()
    const app = buildApp({
      supabaseAdmin: client,
      ticketRepository: {
        resolveEventIdBySlug: async () => EVENT_ID,
        resolveTicketByQrToken: async () => ({ id: OTHER_EVENT_TICKET_ID, event_id: 'otro-evento' }),
      },
    })
    const server = listen(app)
    try {
      await post(server, '/api/tickets/checkin/scan-events', {
        eventSlug: 'pitbull-classic-2026',
        deviceId: 'device-1',
        attempts: [
          {
            clientId: '33333333-3333-4333-8333-333333333333',
            scannedAt: new Date().toISOString(),
            kind: 'ticket',
            outcome: 'expired',
            qrToken: 'algun-token',
          },
        ],
      })
      expect(upserts[0].rows[0].ticket_id).toBeNull()
    } finally {
      server.close()
    }
  })

  it('rechaza un lote de más de 50 intentos', async () => {
    readSessionFromRequest.mockResolvedValue(staffSession())
    const app = buildApp()
    const server = listen(app)
    try {
      const attempts = Array.from({ length: 51 }, (_, index) => ({
        clientId: `44444444-4444-4444-8444-4444444444${String(index).padStart(2, '0')}`,
        scannedAt: new Date().toISOString(),
        kind: 'ticket',
        outcome: 'ready',
      }))
      const response = await post(server, '/api/tickets/checkin/scan-events', {
        eventSlug: 'pitbull-classic-2026',
        deviceId: 'device-1',
        attempts,
      })
      expect(response.status).toBe(400)
    } finally {
      server.close()
    }
  })

  it('rechaza un outcome fuera del catálogo cerrado', async () => {
    readSessionFromRequest.mockResolvedValue(staffSession())
    const app = buildApp()
    const server = listen(app)
    try {
      const response = await post(server, '/api/tickets/checkin/scan-events', {
        eventSlug: 'pitbull-classic-2026',
        deviceId: 'device-1',
        attempts: [
          {
            clientId: '55555555-5555-4555-8555-555555555555',
            scannedAt: new Date().toISOString(),
            kind: 'ticket',
            outcome: 'hackeado',
          },
        ],
      })
      expect(response.status).toBe(400)
    } finally {
      server.close()
    }
  })

  it('una cuenta sin admin.checkin.execute no puede reportar telemetría', async () => {
    readSessionFromRequest.mockResolvedValue(staffSession({ permissions: ['admin.audit.read'] }))
    const app = buildApp()
    const server = listen(app)
    try {
      const response = await post(server, '/api/tickets/checkin/scan-events', {
        eventSlug: 'pitbull-classic-2026',
        deviceId: 'device-1',
        attempts: [
          {
            clientId: '66666666-6666-4666-8666-666666666666',
            scannedAt: new Date().toISOString(),
            kind: 'ticket',
            outcome: 'ready',
          },
        ],
      })
      expect(response.status).toBe(403)
    } finally {
      server.close()
    }
  })
})

describe('GET /api/tickets/checkin/scan-report/:eventSlug', () => {
  it('exige admin.audit.read, no alcanza con admin.checkin.execute', async () => {
    readSessionFromRequest.mockResolvedValue(staffSession())
    const app = buildApp()
    const server = listen(app)
    try {
      const response = await fetch(
        `${server.url}/api/tickets/checkin/scan-report/pitbull-classic-2026`,
      )
      expect(response.status).toBe(403)
    } finally {
      server.close()
    }
  })

  it('con admin.audit.read devuelve el informe del repositorio', async () => {
    readSessionFromRequest.mockResolvedValue(
      staffSession({ permissions: ['admin.checkin.execute', 'admin.audit.read'] }),
    )
    const scanReport = vi.fn(async () => ({ summary: { total: 3 } }))
    const app = buildApp({ ticketRepository: { scanReport } })
    const server = listen(app)
    try {
      const response = await fetch(
        `${server.url}/api/tickets/checkin/scan-report/pitbull-classic-2026`,
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.summary.total).toBe(3)
      expect(scanReport).toHaveBeenCalledWith(
        'pitbull-classic-2026',
        expect.objectContaining({ from: null, until: null, limit: null }),
      )
    } finally {
      server.close()
    }
  })
})
