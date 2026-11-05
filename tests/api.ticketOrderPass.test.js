import { describe, expect, it, vi } from 'vitest'
import { HttpError } from '../server/lib/errors.js'
import { createApp } from '../server/app.js'
import { createPrismaDouble } from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

const ORDER_ID = '22222222-2222-4222-8222-222222222222'
const TOKEN = 'a'.repeat(40)

function found(status) {
  return {
    order: {
      id: ORDER_ID,
      status,
      reference: 'TORD-abc123',
      event: { title: 'Pitbull Classic 2026', slug: 'pitbull-classic-2026' },
    },
    tickets: [
      {
        id: 't1',
        order_id: ORDER_ID,
        ticket_code: 'TCK-1',
        qr_token: '11111111-1111-4111-8111-111111111111',
        gate_code: 'K4M-7QP',
        attendee_name: 'Camila',
        status: status === 'aprobado' ? 'pagada' : 'pendiente_pago',
      },
    ],
  }
}

function appWith(findOrderForBuyer) {
  return createApp({
    prisma: createPrismaDouble([]),
    supabaseAdmin: null,
    ticketRepository: { findOrderForBuyer },
    env: { ...process.env, NODE_ENV: 'test' },
  })
}

describe('GET /api/tickets/orders/:orderId/pass', () => {
  it('devuelve el QR cuando la compra ya está acreditada', async () => {
    const findOrderForBuyer = vi.fn(async () => found('aprobado'))
    const server = listen(appWith(findOrderForBuyer))
    try {
      const response = await fetch(`${server.url}/api/tickets/orders/${ORDER_ID}/pass`, {
        headers: { 'X-Order-Access-Token': TOKEN },
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.order.status).toBe('aprobado')
      expect(body.tickets[0].qr_token).toBe('11111111-1111-4111-8111-111111111111')
      expect(body.tickets[0].gate_code).toBe('K4M-7QP')
      expect(findOrderForBuyer).toHaveBeenCalledWith(ORDER_ID, TOKEN)
    } finally {
      await server.close()
    }
  })

  it('no manda el QR si el pago todavía no está acreditado', async () => {
    const server = listen(appWith(vi.fn(async () => found('pendiente'))))
    try {
      const response = await fetch(`${server.url}/api/tickets/orders/${ORDER_ID}/pass`, {
        headers: { 'X-Order-Access-Token': TOKEN },
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.order.status).toBe('pendiente')
      expect(body.tickets).toEqual([])
    } finally {
      await server.close()
    }
  })

  it('rechaza un token que no es de esa compra', async () => {
    const server = listen(
      appWith(vi.fn(async () => {
        throw new HttpError(403, 'Token de orden invalido.')
      })),
    )
    try {
      const response = await fetch(`${server.url}/api/tickets/orders/${ORDER_ID}/pass`, {
        headers: { 'X-Order-Access-Token': TOKEN },
      })
      expect(response.status).toBe(403)
    } finally {
      await server.close()
    }
  })
})
