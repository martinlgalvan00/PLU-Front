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
 * El comprador de entradas es anónimo: no tiene cuenta, y la orden vive en el
 * `sessionStorage` de la pestaña donde compró. Entre la transferencia y la
 * acreditación pueden pasar 48 horas, así que esa pestaña ya no está.
 *
 * El rechazo de comprobante avisaba por mail desde antes; la aprobación no
 * avisaba nada, que es el lado que más importa. `ticket_confirmation` ya
 * existía entero en el catálogo y en las plantillas, sin nadie que lo emitiera.
 */

const ORDER_ID = '22222222-2222-4222-8222-222222222222'
const EVENT_ID = '11111111-1111-4111-8111-111111111111'

function approvedOrder(overrides = {}) {
  return {
    id: ORDER_ID,
    event_id: EVENT_ID,
    status: 'aprobado',
    buyer_name: 'Camila Rearte',
    buyer_email: 'camila@example.com',
    reference: 'TORD-abc123',
    updated_at: '2026-03-10T12:00:00.000Z',
    ...overrides,
  }
}

function ticketRows() {
  return [
    { id: 't1', is_primary_credential: true },
    // Una compra de entrenador emite dos credenciales y sigue siendo UNA
    // entrada: la secundaria no puede inflar la cantidad del mail.
    { id: 't2', is_primary_credential: false },
    { id: 't3', is_primary_credential: true },
  ]
}

async function withApp(run, { order = approvedOrder(), tickets = ticketRows() } = {}) {
  const approve = vi.fn().mockResolvedValue({ order, tickets, duplicate: false })
  const send = vi.fn().mockResolvedValue({ messageId: 'brevo-1' })
  const staff = await buildStaffUser({ email: 'finanzas@plu.test' })

  const app = createApp({
    prisma: createPrismaDouble([staff]),
    supabaseAdmin: null,
    ticketRepository: { approve },
    athleteRepository: {
      findEventSummary: async () => ({
        id: EVENT_ID,
        title: 'Pitbull Classic 2026',
        slug: 'pitbull-classic-2026',
        starts_at: '2026-12-12T12:00:00.000Z',
        venue: 'Maximal Strength Club',
      }),
    },
    platformSettingsRepository: { get: async () => ({}) },
    brevo: { send, configured: true },
    env: { ...process.env, NODE_ENV: 'test', VITE_APP_URL: 'https://plu.test' },
  })

  const server = listen(app)
  try {
    const { cookie } = await loginStaff(server.url, { email: 'finanzas@plu.test' })
    const response = await fetch(`${server.url}/api/tickets/orders/${ORDER_ID}/approve`, {
      method: 'POST',
      headers: authHeaders(cookie),
    })
    await run({ response, send, approve })
  } finally {
    await server.close()
  }
}

describe('POST /api/tickets/orders/:id/approve', () => {
  it('avisa al comprador que su entrada quedó paga', async () => {
    await withApp(async ({ response, send }) => {
      expect(response.status).toBe(200)
      expect(send).toHaveBeenCalledTimes(1)
      const [payload] = send.mock.calls[0]
      expect(payload.to).toBe('camila@example.com')
    })
  })

  it('cuenta una entrada por compra, no una por credencial', async () => {
    await withApp(async ({ send }) => {
      const [payload] = send.mock.calls[0]
      const { params } = payload
      expect(params.quantity).toBe('2')
      expect(params.eventTitle).toBe('Pitbull Classic 2026')
      expect(params.reference).toBe('TORD-abc123')
    })
  })

  it('una orden sin email de comprador no rompe la acreditación', async () => {
    await withApp(
      async ({ response, send }) => {
        expect(response.status).toBe(200)
        expect(send).not.toHaveBeenCalled()
      },
      { order: approvedOrder({ buyer_email: null }) },
    )
  })

  it('reaprobar una orden ya aprobada no reenvía el mail', async () => {
    const approve = vi
      .fn()
      .mockResolvedValue({ order: approvedOrder(), tickets: ticketRows(), duplicate: true })
    const send = vi.fn()
    const staff = await buildStaffUser({ email: 'finanzas@plu.test' })
    const app = createApp({
      prisma: createPrismaDouble([staff]),
      supabaseAdmin: null,
      ticketRepository: { approve },
      athleteRepository: { findEventSummary: async () => null },
      platformSettingsRepository: { get: async () => ({}) },
      brevo: { send, configured: true },
      env: { ...process.env, NODE_ENV: 'test' },
    })
    const server = listen(app)
    try {
      const { cookie } = await loginStaff(server.url, { email: 'finanzas@plu.test' })
      const response = await fetch(`${server.url}/api/tickets/orders/${ORDER_ID}/approve`, {
        method: 'POST',
        headers: authHeaders(cookie),
      })
      expect(response.status).toBe(200)
      expect(send).not.toHaveBeenCalled()
    } finally {
      await server.close()
    }
  })
})
