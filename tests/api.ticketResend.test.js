import { describe, expect, it, vi } from 'vitest'
import { signTicketOpenKey } from '../server/modules/ticketing/ticketOpenLink.js'
import { createApp } from '../server/app.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

const ORDER_ID = '22222222-2222-4222-8222-222222222222'
const QR = '11111111-1111-4111-8111-111111111111'

function approvedOrder(overrides = {}) {
  return {
    id: ORDER_ID,
    event_id: '11111111-1111-4111-8111-111111111111',
    status: 'aprobado',
    buyer_name: 'Camila Rearte',
    buyer_email: 'camila@example.com',
    reference: 'TORD-abc123',
    updated_at: '2026-03-10T12:00:00.000Z',
    ...overrides,
  }
}

function foundOrder(overrides = {}) {
  return {
    order: approvedOrder(overrides),
    event: {
      title: 'Pitbull Classic 2026',
      slug: 'pitbull-classic-2026',
      starts_at: '2026-12-12T12:00:00.000Z',
      venue: 'Maximal',
    },
    tickets: [
      {
        id: 't1',
        is_primary_credential: true,
        ticket_code: 'TCK-1',
        qr_token: QR,
        gate_code: 'K4M-7QP',
        attendee_name: 'Camila',
        credential_label: 'Espectador',
        status: 'pagada',
      },
    ],
  }
}

function memoryMails() {
  const logs = new Map()
  return {
    logs,
    async beginEmail(input) {
      if (logs.has(input.idempotencyKey)) {
        return { created: false, emailLog: logs.get(input.idempotencyKey) }
      }
      const emailLog = { id: input.idempotencyKey, status: 'sending', params: input.params }
      logs.set(input.idempotencyKey, emailLog)
      return { created: true, emailLog }
    },
    async completeEmail(id, patch) {
      const next = { ...logs.get(id), ...patch, id }
      logs.set(id, next)
      return next
    },
    async findSuppression() {
      return null
    },
  }
}

describe('reenvío del mail de entradas', () => {
  it('el mismo día no duplica, y el outbox no guarda el token ni el código', async () => {
    const mails = memoryMails()
    const send = vi.fn().mockResolvedValue({ messageId: 'brevo-1' })
    const findOrderForConfirmation = vi.fn(async ({ email, orderId }) => {
      if (email === 'pending@example.com') {
        return foundOrder({ status: 'pendiente', buyer_email: 'pending@example.com' })
      }
      if (orderId === ORDER_ID || email === 'camila@example.com') return foundOrder()
      return null
    })
    const staff = await buildStaffUser({ email: 'finanzas@plu.test' })
    const app = createApp({
      prisma: createPrismaDouble([staff]),
      supabaseAdmin: null,
      ticketRepository: { findOrderForConfirmation },
      notificationRepository: mails,
      brevo: { send, configured: true },
      env: { ...process.env, NODE_ENV: 'test', VITE_APP_URL: 'https://plu.test' },
    })
    const server = listen(app)
    try {
      const missing = await fetch(`${server.url}/api/tickets/orders/resend`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ reference: 'TORD-abc123', email: 'nadie@example.com' }),
      })
      expect(missing.status).toBe(404)

      const pending = await fetch(`${server.url}/api/tickets/orders/resend`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ reference: 'TORD-abc123', email: 'pending@example.com' }),
      })
      expect(pending.status).toBe(409)
      expect(send).not.toHaveBeenCalled()

      const first = await fetch(`${server.url}/api/tickets/orders/resend`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ reference: 'TORD-abc123', email: 'camila@example.com' }),
      })
      expect(first.status).toBe(200)
      expect(await first.json()).toEqual({ status: 'sent' })
      expect(send).toHaveBeenCalledTimes(1)
      const [payload] = send.mock.calls[0]
      expect(payload.attachment).toHaveLength(1)
      expect(payload.attachment[0].name).toBe('qr-TCK-1.png')
      expect(JSON.stringify(payload.params)).not.toContain(QR)

      const { cookie } = await loginStaff(server.url, { email: 'finanzas@plu.test' })
      const second = await fetch(`${server.url}/api/tickets/orders/${ORDER_ID}/resend`, {
        method: 'POST',
        headers: authHeaders(cookie),
      })
      expect(second.status).toBe(200)
      expect(await second.json()).toEqual({ status: 'already' })
      expect(send).toHaveBeenCalledTimes(1)

      const stored = [...mails.logs.values()]
      expect(stored).toHaveLength(1)
      expect(stored[0].id).toMatch(/:resend:\d{4}-\d{2}-\d{2}$/)
      const openKey = signTicketOpenKey('TORD-abc123')
      expect(payload.params.ticketUrl).toContain(`k=${encodeURIComponent(openKey)}`)
      expect(stored[0].params.passes).toBe('[REDACTED]')
      expect(stored[0].params.ticketUrl).toBe('[REDACTED]')
      expect(JSON.stringify(stored[0].params)).not.toContain(QR)
      expect(JSON.stringify(stored[0].params)).not.toContain('K4M-7QP')
      expect(JSON.stringify(stored[0].params)).not.toContain(openKey)
    } finally {
      await server.close()
    }
  })

  it('la clave del mail abre la compra y reenvía sin el mail', async () => {
    const key = signTicketOpenKey('TORD-abc123')
    const send = vi.fn().mockResolvedValue({ messageId: 'brevo-1' })
    const order = {
      ...approvedOrder(),
      event: { title: 'Pitbull Classic 2026', slug: 'pitbull-classic-2026' },
    }
    const app = createApp({
      prisma: createPrismaDouble([]),
      supabaseAdmin: null,
      ticketRepository: {
        findOrderByReference: vi.fn(async (reference) =>
          reference === 'TORD-abc123'
            ? { order, tickets: foundOrder().tickets }
            : null,
        ),
        findOrderForConfirmation: vi.fn(async ({ reference, email }) =>
          !email && reference === 'TORD-abc123' ? foundOrder() : null,
        ),
      },
      notificationRepository: memoryMails(),
      brevo: { send, configured: true },
      env: { ...process.env, NODE_ENV: 'test', VITE_APP_URL: 'https://plu.test' },
    })
    const server = listen(app)
    try {
      const opened = await fetch(
        `${server.url}/api/tickets/orders/lookup?reference=TORD-abc123&k=${encodeURIComponent(key)}`,
        { headers: authHeaders() },
      )
      expect(opened.status).toBe(200)
      const body = await opened.json()
      expect(body.order.reference).toBe('TORD-abc123')
      expect(body.tickets[0].qr_token).toBe(QR)

      const wrong = await fetch(
        `${server.url}/api/tickets/orders/lookup?reference=TORD-abc123&k=no-es-la-firma`,
        { headers: authHeaders() },
      )
      expect(wrong.status).toBe(404)

      const resent = await fetch(`${server.url}/api/tickets/orders/resend`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ reference: 'TORD-abc123', k: key }),
      })
      expect(resent.status).toBe(200)
      expect(await resent.json()).toEqual({ status: 'sent' })
    } finally {
      await server.close()
    }
  })
})
