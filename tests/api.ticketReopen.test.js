import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { HttpError } from '../server/lib/errors.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

/**
 * Reabrir no acredita y no manda mail. El 400 lo decide el esquema de la ruta;
 * el 409 de un rechazo de staff lo levanta la RPC y la ruta lo deja pasar.
 */

const ORDER_ID = '33333333-3333-4333-8333-333333333333'

function reopenedOrder() {
  return {
    id: ORDER_ID,
    event_id: '11111111-1111-4111-8111-111111111111',
    status: 'pendiente',
    buyer_name: 'Matías Tamburino',
    buyer_email: 'matiastamburino@gmail.com',
    reference: 'TORD-8230239c98b6ae05',
    updated_at: '2026-11-20T18:00:00.000Z',
  }
}

async function withApp(run, { reopen, settleCancelled } = {}) {
  const reopenFn =
    reopen ??
    vi.fn().mockResolvedValue({
      order: reopenedOrder(),
      tickets: [{ id: 't1', status: 'pendiente_pago' }],
      duplicate: false,
    })
  const settleFn =
    settleCancelled ??
    vi.fn().mockResolvedValue({
      order: { ...reopenedOrder(), status: 'aprobado' },
      tickets: [{ id: 't1', status: 'pagada' }],
      duplicate: false,
    })
  const send = vi.fn()
  const staff = await buildStaffUser({ email: 'finanzas@plu.test' })
  const app = createApp({
    prisma: createPrismaDouble([staff]),
    supabaseAdmin: null,
    ticketRepository: { reopen: reopenFn, settleCancelled: settleFn },
    platformSettingsRepository: { get: async () => ({}) },
    brevo: { send, configured: true },
    env: { ...process.env, NODE_ENV: 'test' },
  })
  const server = listen(app)
  try {
    const { cookie } = await loginStaff(server.url, { email: 'finanzas@plu.test' })
    await run({ server, cookie, send, reopen: reopenFn, settle: settleFn })
  } finally {
    await server.close()
  }
}

describe('POST /api/tickets/orders/:id/reopen', () => {
  it('rechaza un motivo vacío con 400 y no llama a la base', async () => {
    await withApp(async ({ server, cookie, reopen, send }) => {
      const response = await fetch(`${server.url}/api/tickets/orders/${ORDER_ID}/reopen`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({}),
      })
      expect(response.status).toBe(400)
      expect(reopen).not.toHaveBeenCalled()
      expect(send).not.toHaveBeenCalled()
    })
  })

  it('un rechazo de staff vuelve como 409 y no manda mail', async () => {
    const reopen = vi.fn().mockRejectedValue(
      new HttpError(409, 'Esta orden la rechazó Finanzas: no se reabre por este camino.', {
        code: 'PLU03',
      }),
    )
    await withApp(
      async ({ server, cookie, send }) => {
        const response = await fetch(`${server.url}/api/tickets/orders/${ORDER_ID}/reopen`, {
          method: 'POST',
          headers: authHeaders(cookie),
          body: JSON.stringify({ reason: 'el comprobante ya estaba cargado' }),
        })
        expect(response.status).toBe(409)
        const body = await response.json()
        expect(body.code).toBe('PLU03')
        expect(send).not.toHaveBeenCalled()
      },
      { reopen },
    )
  })

  it('reabre la orden que canceló el vencimiento y no avisa por mail', async () => {
    await withApp(async ({ server, cookie, send, reopen }) => {
      const response = await fetch(`${server.url}/api/tickets/orders/${ORDER_ID}/reopen`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ reason: 'el comprobante ya estaba cargado' }),
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.order.status).toBe('pendiente')
      expect(reopen).toHaveBeenCalledWith(
        ORDER_ID,
        'el comprobante ya estaba cargado',
        expect.stringContaining('finanzas@plu.test'),
      )
      expect(send).not.toHaveBeenCalled()
    })
  })
})

describe('POST /api/tickets/orders/:id/settle', () => {
  it('rechaza un motivo vacío con 400 y no acredita', async () => {
    await withApp(async ({ server, cookie, settle, send }) => {
      const response = await fetch(`${server.url}/api/tickets/orders/${ORDER_ID}/settle`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({}),
      })
      expect(response.status).toBe(400)
      expect(settle).not.toHaveBeenCalled()
      expect(send).not.toHaveBeenCalled()
    })
  })

  it('una orden ya pendiente vuelve como 409 y no manda mail', async () => {
    const settleCancelled = vi.fn().mockRejectedValue(
      new HttpError(409, 'La orden ya está pendiente: acreditala desde la cola.', {
        code: 'PLU03',
      }),
    )
    await withApp(
      async ({ server, cookie, send }) => {
        const response = await fetch(`${server.url}/api/tickets/orders/${ORDER_ID}/settle`, {
          method: 'POST',
          headers: authHeaders(cookie),
          body: JSON.stringify({ reason: 'el comprobante ya estaba cargado' }),
        })
        expect(response.status).toBe(409)
        const body = await response.json()
        expect(body.code).toBe('PLU03')
        expect(send).not.toHaveBeenCalled()
      },
      { settleCancelled },
    )
  })

  it('acredita en un paso y avisa si el mail no salió', async () => {
    await withApp(async ({ server, cookie, settle }) => {
      const response = await fetch(`${server.url}/api/tickets/orders/${ORDER_ID}/settle`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ reason: 'el comprobante ya estaba cargado' }),
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.order.status).toBe('aprobado')
      expect(['sent', 'failed', 'skipped', 'suppressed', 'already']).toContain(body.mail)
      expect(settle).toHaveBeenCalledWith(
        ORDER_ID,
        'el comprobante ya estaba cargado',
        expect.stringContaining('finanzas@plu.test'),
      )
    })
  })
})
