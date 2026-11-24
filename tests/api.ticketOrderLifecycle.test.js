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
 * Ciclo de vida de una orden de entradas desde el panel (20261210100000):
 * cancelar (revoca los QR), volver a aceptar (los reactiva), lista de
 * invitados y "Mis entradas". Las reglas de estado y de cupo viven en las
 * RPC y se prueban en `supabase/tests/ticket_order_lifecycle_flow.sql`; acá se
 * fija el contrato HTTP: permisos, validación del cuerpo y a quién se le
 * avisa por mail.
 */

const ORDER_ID = '22222222-2222-4222-8222-222222222222'
const EVENT_ID = '11111111-1111-4111-8111-111111111111'
const TYPE_ID = '33333333-3333-4333-8333-333333333333'

function order(overrides = {}) {
  return {
    id: ORDER_ID,
    event_id: EVENT_ID,
    status: 'cancelado',
    buyer_name: 'Camila Rearte',
    buyer_email: 'camila@example.com',
    reference: 'TORD-abc123',
    updated_at: '2026-03-10T12:00:00.000Z',
    ...overrides,
  }
}

async function withApp(
  run,
  { role = 'admin_maximal', repository = {}, send = vi.fn().mockResolvedValue({ messageId: 'brevo-1' }) } = {},
) {
  const staff = await buildStaffUser({ role, email: `${role}@lifecycle.test` })
  const repo = {
    cancel: vi.fn(),
    reinstate: vi.fn(),
    issueGuestTickets: vi.fn(),
    listGuestOrders: vi.fn().mockResolvedValue([]),
    findOrderSummary: vi.fn(),
    resolveEventIdBySlug: vi.fn().mockResolvedValue(EVENT_ID),
    ...repository,
  }
  const app = createApp({
    prisma: createPrismaDouble([staff]),
    supabaseAdmin: null,
    ticketRepository: repo,
    athleteRepository: {
      findEventSummary: async () => ({
        id: EVENT_ID,
        title: 'Pitbull Classic 2026',
        slug: 'pitbull-classic-2026',
        starts_at: '2026-12-12T12:00:00.000Z',
      }),
    },
    platformSettingsRepository: { get: async () => ({}) },
    brevo: { send, configured: true },
    env: { ...process.env, NODE_ENV: 'test', VITE_APP_URL: 'https://plu.test' },
  })
  const server = listen(app)
  try {
    const { cookie } = await loginStaff(server.url, { email: staff.email })
    const post = (path, body = {}) =>
      fetch(`${server.url}${path}`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify(body),
      })
    await run({ post, repo, send, server, cookie })
  } finally {
    await server.close()
  }
}

describe('POST /api/tickets/orders/:id/cancel', () => {
  it('cancela una aprobada y le avisa el motivo al comprador', async () => {
    await withApp(
      async ({ post, repo, send }) => {
        const response = await post(`/api/tickets/orders/${ORDER_ID}/cancel`, {
          reason: 'Transferencia revertida',
        })
        expect(response.status).toBe(200)
        expect(repo.cancel).toHaveBeenCalledWith(
          ORDER_ID,
          'Transferencia revertida',
          expect.stringContaining('admin_maximal@lifecycle.test'),
        )
        expect(send).toHaveBeenCalledTimes(1)
        const [payload] = send.mock.calls[0]
        expect(payload.subject).toBe('Tu entrada fue cancelada · PLU ARG')
        expect(payload.to).toBe('camila@example.com')
        expect(payload.params.reason).toBe('Transferencia revertida')
      },
      {
        repository: {
          cancel: vi.fn().mockResolvedValue({
            order: order(),
            tickets: [],
            previousStatus: 'aprobado',
            duplicate: false,
          }),
        },
      },
    )
  })

  it('no manda mail al cerrar una orden que nunca se cobró', async () => {
    await withApp(
      async ({ post, send }) => {
        const response = await post(`/api/tickets/orders/${ORDER_ID}/cancel`, {})
        expect(response.status).toBe(200)
        expect(send).not.toHaveBeenCalled()
      },
      {
        repository: {
          cancel: vi.fn().mockResolvedValue({
            order: order(),
            tickets: [],
            previousStatus: 'pendiente',
            duplicate: false,
          }),
        },
      },
    )
  })

  it('bloquea a seguridad: cancelar es una decisión de Finanzas', async () => {
    await withApp(
      async ({ post, repo }) => {
        const response = await post(`/api/tickets/orders/${ORDER_ID}/cancel`, { reason: 'x' })
        expect(response.status).toBe(403)
        expect(repo.cancel).not.toHaveBeenCalled()
      },
      { role: 'seguridad_plu_arg' },
    )
  })

  it('rechaza un id que no es uuid sin tocar la base', async () => {
    await withApp(async ({ post, repo }) => {
      const response = await post('/api/tickets/orders/no-es-uuid/cancel', { reason: 'abc' })
      expect(response.status).toBe(400)
      expect(repo.cancel).not.toHaveBeenCalled()
    })
  })
})

describe('POST /api/tickets/orders/:id/reinstate', () => {
  it('vuelve a aceptar y reenvía la entrada por mail', async () => {
    await withApp(
      async ({ post, repo, send }) => {
        const response = await post(`/api/tickets/orders/${ORDER_ID}/reinstate`)
        expect(response.status).toBe(200)
        expect(repo.reinstate).toHaveBeenCalledWith(ORDER_ID, expect.any(String))
        expect(send).toHaveBeenCalledTimes(1)
        expect(send.mock.calls[0][0].subject).toBe('Tu entrada · PLU ARG')
      },
      {
        repository: {
          reinstate: vi.fn().mockResolvedValue({
            order: order({ status: 'aprobado' }),
            tickets: [{ id: 't1', is_primary_credential: true }],
            previousStatus: 'rechazado',
            duplicate: false,
          }),
        },
      },
    )
  })
})

describe('Lista de invitados', () => {
  it('normaliza el DNI, emite y manda mail sólo a quien tiene email', async () => {
    const issued = [
      {
        order: order({ id: 'o1', status: 'aprobado', buyer_email: 'prensa@example.com' }),
        tickets: [{ id: 't1', is_primary_credential: true }],
      },
      {
        order: order({ id: 'o2', status: 'aprobado', buyer_email: null }),
        tickets: [{ id: 't2', is_primary_credential: true }],
      },
    ]
    await withApp(
      async ({ post, repo, send }) => {
        const response = await post('/api/tickets/guests/pitbull-classic-2026', {
          ticketTypeId: TYPE_ID,
          label: 'Prensa',
          guests: [
            { fullName: 'Prensa Uno', dni: '40.111.222', email: 'prensa@example.com' },
            { fullName: 'Prensa Dos', dni: '40111333' },
          ],
        })
        expect(response.status).toBe(201)
        const body = await response.json()
        expect(body.emailed).toBe(1)
        expect(repo.issueGuestTickets).toHaveBeenCalledWith(
          {
            eventSlug: 'pitbull-classic-2026',
            ticketTypeId: TYPE_ID,
            label: 'Prensa',
            guests: [
              { fullName: 'Prensa Uno', dni: '40111222', email: 'prensa@example.com' },
              { fullName: 'Prensa Dos', dni: '40111333', email: '' },
            ],
          },
          expect.any(String),
        )
        expect(send).toHaveBeenCalledTimes(1)
        expect(send.mock.calls[0][0]).toMatchObject({
          subject: 'Tu entrada · PLU ARG',
          to: 'prensa@example.com',
        })
      },
      {
        repository: {
          issueGuestTickets: vi.fn().mockResolvedValue({ issued, skipped: [] }),
        },
      },
    )
  })

  it('si Brevo falla, no cuenta el mail como enviado y lo informa', async () => {
    const issued = [
      {
        order: order({ id: 'o1', status: 'aprobado', buyer_email: 'prensa@example.com' }),
        tickets: [{ id: 't1', is_primary_credential: true }],
      },
    ]
    await withApp(
      async ({ post }) => {
        const response = await post('/api/tickets/guests/pitbull-classic-2026', {
          ticketTypeId: TYPE_ID,
          guests: [{ fullName: 'Prensa Uno', dni: '40111222', email: 'prensa@example.com' }],
        })
        expect(response.status).toBe(201)
        const body = await response.json()
        expect(body.emailed).toBe(0)
        expect(body.emailFailed).toBe(1)
      },
      {
        send: vi.fn().mockRejectedValue(new Error('brevo caído')),
        repository: { issueGuestTickets: vi.fn().mockResolvedValue({ issued, skipped: [] }) },
      },
    )
  })

  it('rechaza un DNI inválido antes de llegar a la base', async () => {
    await withApp(async ({ post, repo }) => {
      const response = await post('/api/tickets/guests/pitbull-classic-2026', {
        ticketTypeId: TYPE_ID,
        guests: [{ fullName: 'Sin Documento', dni: '12' }],
      })
      expect(response.status).toBe(400)
      expect(repo.issueGuestTickets).not.toHaveBeenCalled()
    })
  })

  it('no deja dar de baja desde invitados una orden que no es de cortesía', async () => {
    await withApp(
      async ({ post, repo }) => {
        const response = await post(
          `/api/tickets/guests/pitbull-classic-2026/${ORDER_ID}/cancel`,
          { reason: 'No viene' },
        )
        expect(response.status).toBe(404)
        expect(repo.cancel).not.toHaveBeenCalled()
      },
      {
        repository: {
          findOrderSummary: vi.fn().mockResolvedValue({
            id: ORDER_ID,
            event_id: EVENT_ID,
            provider: 'manual',
            manual_payment_channel: 'bank_transfer',
            status: 'aprobado',
          }),
        },
      },
    )
  })

  it('bloquea a seguridad: emitir invitaciones es de la organización del evento', async () => {
    await withApp(
      async ({ post, repo }) => {
        const response = await post('/api/tickets/guests/pitbull-classic-2026', {
          ticketTypeId: TYPE_ID,
          guests: [{ fullName: 'Prensa Uno', dni: '40111222' }],
        })
        expect(response.status).toBe(403)
        expect(repo.issueGuestTickets).not.toHaveBeenCalled()
      },
      { role: 'seguridad_plu_arg' },
    )
  })
})

describe('GET /api/tickets/mine', () => {
  it('exige sesión de atleta', async () => {
    await withApp(async ({ server }) => {
      const response = await fetch(`${server.url}/api/tickets/mine`)
      expect([401, 503]).toContain(response.status)
    })
  })
})
