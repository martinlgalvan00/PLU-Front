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
 * Venta de mostrador: un operador carga una venta que se cerró por fuera del
 * checkout público (efectivo en la puerta, transferencia recibida por
 * privado). A diferencia de POST /orders, efectivo se auto-aprueba en el
 * mismo request; transferencia queda `pendiente` y sigue el circuito de
 * validación existente.
 */

const ORDER_ID = '22222222-2222-4222-8222-222222222222'
const EVENT_ID = '11111111-1111-4111-8111-111111111111'
const TICKET_TYPE_ID = '33333333-3333-4333-8333-333333333333'

function attendee(overrides = {}) {
  return { fullName: 'Camila Rearte', dni: '30111222', ticketTypeId: TICKET_TYPE_ID, ...overrides }
}

function manualOrderBody(overrides = {}) {
  return {
    eventSlug: 'pitbull-classic-2026',
    attendees: [attendee()],
    buyer: { name: 'Juan Operador', email: 'compra@example.com' },
    manualPaymentChannel: 'cash_pitbull',
    ...overrides,
  }
}

function pendingOrder(overrides = {}) {
  return {
    id: ORDER_ID,
    event_id: EVENT_ID,
    status: 'pendiente',
    provider: 'manual',
    manual_payment_channel: 'bank_transfer',
    buyer_name: 'Juan Operador',
    buyer_email: 'compra@example.com',
    reference: 'TORD-manual1',
    updated_at: '2026-03-10T12:00:00.000Z',
    ...overrides,
  }
}

function approvedOrder(overrides = {}) {
  return pendingOrder({
    status: 'aprobado',
    manual_payment_channel: 'cash_pitbull',
    ...overrides,
  })
}

function ticketRows() {
  return [{ id: 't1', is_primary_credential: true }]
}

async function withApp(run, { createOrder, approve, role = 'admin_maximal' } = {}) {
  const staff = await buildStaffUser({ role, email: 'mostrador@plu.test' })
  const send = vi.fn().mockResolvedValue({ messageId: 'brevo-1' })

  const app = createApp({
    prisma: createPrismaDouble([staff]),
    supabaseAdmin: null,
    ticketRepository: { createOrder, approve },
    athleteRepository: { findEventSummary: async () => null },
    platformSettingsRepository: { get: async () => ({}) },
    brevo: { send, configured: true },
    env: { ...process.env, NODE_ENV: 'test', VITE_APP_URL: 'https://plu.test' },
  })

  const server = listen(app)
  try {
    const { cookie } = await loginStaff(server.url, { email: 'mostrador@plu.test' })
    const post = (body) =>
      fetch(`${server.url}/api/tickets/orders/manual`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify(body),
      })
    await run({ post, send })
  } finally {
    await server.close()
  }
}

describe('POST /api/tickets/orders/manual', () => {
  it('efectivo: crea la orden, la aprueba en el mismo request y avisa por mail', async () => {
    const createOrder = vi
      .fn()
      .mockResolvedValue({ order: pendingOrder(), tickets: ticketRows(), duplicate: false })
    const approve = vi
      .fn()
      .mockResolvedValue({ order: approvedOrder(), tickets: ticketRows(), duplicate: false })

    await withApp(
      async ({ post, send }) => {
        const response = await post(manualOrderBody({ manualPaymentChannel: 'cash_pitbull' }))
        expect(response.status).toBe(201)
        const body = await response.json()
        expect(body.approved).toBe(true)
        expect(body.order.status).toBe('aprobado')
        expect(createOrder).toHaveBeenCalledTimes(1)
        const [payload] = createOrder.mock.calls[0]
        expect(payload.provider).toBe('manual')
        expect(payload.staffActor).toMatch(/mostrador@plu\.test$/)
        expect(approve).toHaveBeenCalledWith(ORDER_ID, expect.stringMatching(/mostrador@plu\.test$/))
        expect(send).toHaveBeenCalledTimes(1)
      },
      { createOrder, approve },
    )
  })

  it('transferencia: crea la orden y la deja pendiente, sin aprobar ni mandar mail', async () => {
    const createOrder = vi
      .fn()
      .mockResolvedValue({ order: pendingOrder(), tickets: ticketRows(), duplicate: false })
    const approve = vi.fn()

    await withApp(
      async ({ post, send }) => {
        const response = await post(manualOrderBody({ manualPaymentChannel: 'bank_transfer' }))
        expect(response.status).toBe(201)
        const body = await response.json()
        expect(body.approved).toBe(false)
        expect(body.order.status).toBe('pendiente')
        expect(approve).not.toHaveBeenCalled()
        expect(send).not.toHaveBeenCalled()
      },
      { createOrder, approve },
    )
  })

  it('sin admin.payments.approve responde 403 y no crea la orden', async () => {
    const createOrder = vi.fn()
    const approve = vi.fn()

    await withApp(
      async ({ post }) => {
        const response = await post(manualOrderBody())
        expect(response.status).toBe(403)
        expect(createOrder).not.toHaveBeenCalled()
      },
      { createOrder, approve, role: 'seguridad_plu_arg' },
    )
  })

  it('DNI repetido entre asistentes responde 400 antes de tocar el repositorio', async () => {
    const createOrder = vi.fn()
    const approve = vi.fn()

    await withApp(
      async ({ post }) => {
        const response = await post(
          manualOrderBody({
            attendees: [attendee(), attendee({ fullName: 'Otro Nombre' })],
          }),
        )
        expect(response.status).toBe(400)
        expect(createOrder).not.toHaveBeenCalled()
      },
      { createOrder, approve },
    )
  })

  it('más de 8 asistentes responde 400 (el límite real de la RPC, no el del checkout público)', async () => {
    const createOrder = vi.fn()
    const approve = vi.fn()

    await withApp(
      async ({ post }) => {
        const response = await post(
          manualOrderBody({
            attendees: Array.from({ length: 9 }, (_, index) =>
              attendee({ dni: String(30111222 + index) }),
            ),
          }),
        )
        expect(response.status).toBe(400)
        expect(createOrder).not.toHaveBeenCalled()
      },
      { createOrder, approve },
    )
  })
})
