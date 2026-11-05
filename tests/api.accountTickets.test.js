import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

const ATHLETE_ID = '11111111-1111-4111-8111-111111111111'
const TYPE_ID = '33333333-3333-4333-8333-333333333333'

function athleteRow(overrides = {}) {
  return {
    id: ATHLETE_ID,
    email: 'Camila@Example.com',
    document_id: '30.111.222',
    email_verified_at: null,
    ...overrides,
  }
}

function athleteSupabase(athlete = athleteRow()) {
  return {
    from(table) {
      if (table === 'athlete_sessions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'session-1',
                  athlete_id: athlete.id,
                  expires_at: '2099-01-01T00:00:00.000Z',
                  revoked_at: null,
                  last_seen_at: new Date().toISOString(),
                },
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ data: null, error: null }) }),
        }
      }
      if (table === 'athletes') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: athlete, error: null }),
            }),
          }),
        }
      }
      throw new Error(`Tabla inesperada: ${table}`)
    },
  }
}

function orderBody(extra = {}) {
  return {
    eventSlug: 'pitbull-classic-2026',
    attendees: [{ fullName: 'Camila Rearte', dni: '30111222', ticketTypeId: TYPE_ID }],
    buyer: { name: 'Camila Rearte', email: 'camila@example.com' },
    provider: 'mercado_pago',
    buyerAthleteId: 'spoof-id',
    ...extra,
  }
}

function publicApp({ supabaseAdmin, ticketRepository, prisma = null }) {
  return createApp({
    prisma,
    supabaseAdmin,
    ticketRepository,
    platformSettingsRepository: { get: async () => ({}) },
    athleteRepository: {
      findEventPricing: async () => ({
        slug: 'pitbull-classic-2026',
        rules: { ticketsEnabled: true },
      }),
    },
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PAID_CHECKOUT_ENABLED: 'true',
      TICKET_SALES_ENABLED: 'true',
    },
  })
}

const headers = {
  'Content-Type': 'application/json',
  Origin: 'http://localhost:5173',
  'X-PLU-Request': 'browser',
}

describe('compras de entradas atadas a la cuenta', () => {
  it('sin sesión no lista entradas', async () => {
    const app = publicApp({
      supabaseAdmin: athleteSupabase(),
      ticketRepository: { listTicketsForAccount: vi.fn() },
    })
    const server = listen(app)
    try {
      const response = await fetch(`${server.url}/api/tickets/mine`)
      expect(response.status).toBe(401)
    } finally {
      await server.close()
    }
  })

  it('el id sale de la cookie, no de la query, y una pendiente no trae el QR', async () => {
    const listTicketsForAccount = vi.fn(async () => ({
      buyerOrders: [
        {
          order: {
            id: 'order-1',
            status: 'pendiente',
            reference: 'TORD-pendiente',
            buyer_email: 'secret-buyer@example.com',
            event: { title: 'Pitbull', slug: 'pitbull', starts_at: null, venue: null },
          },
          tickets: [
            {
              id: 't1',
              order_id: 'order-1',
              qr_token: 'secret-qr',
              gate_code: 'AAA-BBB',
              ticket_code: 'TCK-1',
              attendee_name: 'Camila',
              status: 'pendiente_pago',
            },
          ],
        },
      ],
      attendeeTickets: [
        {
          order: {
            id: 'order-2',
            status: 'aprobado',
            reference: 'TORD-ajena',
            buyer_email: 'secret-buyer@example.com',
            event: { title: 'Pitbull', slug: 'pitbull', starts_at: null, venue: null },
          },
          ticket: {
            id: 't2',
            order_id: 'order-2',
            qr_token: 'qr-propio',
            gate_code: 'CCC-DDD',
            ticket_code: 'TCK-2',
            attendee_name: 'Camila',
            attendee_dni: '30111222',
            status: 'pagada',
          },
        },
      ],
    }))
    const app = publicApp({
      supabaseAdmin: athleteSupabase(),
      ticketRepository: { listTicketsForAccount },
    })
    const server = listen(app)
    try {
      const response = await fetch(
        `${server.url}/api/tickets/mine?athleteId=otra-cuenta`,
        { headers: { Cookie: 'plu_athlete_session=account-tickets-athlete' } },
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(listTicketsForAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'athlete',
          id: ATHLETE_ID,
          email: 'camila@example.com',
          emailVerified: false,
          documentKeys: ['30111222'],
        }),
      )
      expect(body.orders[0].tickets[0].qr_token).toBeNull()
      expect(body.attendeeTickets[0].ticket.qr_token).toBe('qr-propio')
      expect(body.attendeeTickets[0].order.buyer_email).toBeUndefined()
      expect(JSON.stringify(body)).not.toContain('secret-buyer@example.com')
      expect(JSON.stringify(body)).not.toContain('secret-qr')
    } finally {
      await server.close()
    }
  })

  it('la compra pública graba al atleta de la cookie e ignora un id mandado en el body', async () => {
    const createOrder = vi.fn(async () => ({ order: { id: 'ord-1', status: 'creado' }, tickets: [] }))
    const attachBuyerAccount = vi.fn(async () => null)
    const app = publicApp({
      supabaseAdmin: athleteSupabase(athleteRow({ email_verified_at: '2026-01-01T00:00:00.000Z' })),
      ticketRepository: { createOrder, attachBuyerAccount },
    })
    const server = listen(app)
    try {
      const response = await fetch(`${server.url}/api/tickets/orders`, {
        method: 'POST',
        headers: { ...headers, Cookie: 'plu_athlete_session=account-tickets-buyer' },
        body: JSON.stringify(orderBody()),
      })
      expect(response.status).toBe(201)
      expect(createOrder.mock.calls[0][0].buyerAthleteId).toBeUndefined()
      expect(attachBuyerAccount).toHaveBeenCalledWith(
        'ord-1',
        expect.objectContaining({ kind: 'athlete', id: ATHLETE_ID, emailVerified: true }),
      )
    } finally {
      await server.close()
    }
  })

  it('si la sesión es de staff, la compra queda de esa cuenta', async () => {
    const staff = await buildStaffUser({ email: 'operador@plu.test' })
    const createOrder = vi.fn(async () => ({ order: { id: 'ord-staff', status: 'creado' }, tickets: [] }))
    const attachBuyerAccount = vi.fn(async () => null)
    const app = publicApp({
      prisma: createPrismaDouble([staff]),
      supabaseAdmin: null,
      ticketRepository: { createOrder, attachBuyerAccount },
    })
    const server = listen(app)
    try {
      const { cookie } = await loginStaff(server.url, { email: 'operador@plu.test' })
      const response = await fetch(`${server.url}/api/tickets/orders`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify(orderBody()),
      })
      expect(response.status).toBe(201)
      expect(attachBuyerAccount).toHaveBeenCalledWith(
        'ord-staff',
        expect.objectContaining({ kind: 'staff', id: staff.id, emailVerified: false }),
      )
    } finally {
      await server.close()
    }
  })

  it('el mostrador no le asigna la venta al operador', async () => {
    const staff = await buildStaffUser({ email: 'mostrador@plu.test' })
    const createOrder = vi.fn(async () => ({
      order: {
        id: '22222222-2222-4222-8222-222222222222',
        status: 'pendiente',
        provider: 'manual',
        manual_payment_channel: 'bank_transfer',
        buyer_email: 'compra@example.com',
        reference: 'TORD-manual',
      },
      tickets: [],
      duplicate: false,
    }))
    const attachBuyerAccount = vi.fn()
    const app = createApp({
      prisma: createPrismaDouble([staff]),
      supabaseAdmin: null,
      ticketRepository: { createOrder, attachBuyerAccount },
      athleteRepository: { findEventSummary: async () => null },
      platformSettingsRepository: { get: async () => ({}) },
      env: { ...process.env, NODE_ENV: 'test', VITE_APP_URL: 'https://plu.test' },
    })
    const server = listen(app)
    try {
      const { cookie } = await loginStaff(server.url, { email: 'mostrador@plu.test' })
      const response = await fetch(`${server.url}/api/tickets/orders/manual`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({
          eventSlug: 'pitbull-classic-2026',
          attendees: [{ fullName: 'Camila Rearte', dni: '30111222', ticketTypeId: TYPE_ID }],
          buyer: { name: 'Juan Operador', email: 'compra@example.com' },
          manualPaymentChannel: 'bank_transfer',
        }),
      })
      expect(response.status).toBe(201)
      expect(createOrder).toHaveBeenCalled()
      expect(attachBuyerAccount).not.toHaveBeenCalled()
    } finally {
      await server.close()
    }
  })
})
