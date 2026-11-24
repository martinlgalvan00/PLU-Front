import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

const QR = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
const EVENT_ID = '11111111-1111-4111-8111-111111111111'

describe('POST /api/tickets/checkin/preview', () => {
  it('resuelve código de puerta y token en una sola llamada, y el verify público no', async () => {
    const findQrTokenByGateCode = vi.fn(async (code) => (code === 'K4M-7QP' ? QR : null))
    const verify = vi.fn(async (qrToken) => ({
      ticket: { id: 't1', qr_token: qrToken, event_id: EVENT_ID, status: 'pagada', gate_code: 'K4M-7QP' },
      event: { id: EVENT_ID, slug: 'pitbull' },
      checkIn: null,
    }))
    const staff = await buildStaffUser({ email: 'puerta@plu.test' })
    const app = createApp({
      prisma: createPrismaDouble([staff]),
      supabaseAdmin: null,
      ticketRepository: { findQrTokenByGateCode, verify },
      env: { ...process.env, NODE_ENV: 'test' },
    })
    const server = listen(app)
    try {
      const { cookie } = await loginStaff(server.url, { email: 'puerta@plu.test' })
      const spoken = await fetch(`${server.url}/api/tickets/checkin/preview`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ code: 'k4m 7qp' }),
      })
      expect(spoken.status).toBe(200)
      const spokenBody = await spoken.json()
      expect(spokenBody.ticket.ticket.qr_token).toBe(QR)
      expect(findQrTokenByGateCode).toHaveBeenCalledTimes(1)
      expect(findQrTokenByGateCode).toHaveBeenCalledWith('K4M-7QP')
      expect(verify).toHaveBeenCalledTimes(1)

      const scanned = await fetch(`${server.url}/api/tickets/checkin/preview`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ code: QR }),
      })
      expect(scanned.status).toBe(200)
      expect(findQrTokenByGateCode).toHaveBeenCalledTimes(1)
      expect(verify).toHaveBeenCalledTimes(2)
      expect(verify).toHaveBeenLastCalledWith(QR)

      findQrTokenByGateCode.mockClear()
      const publicVerify = await fetch(`${server.url}/api/tickets/verify/K4M-7QP`)
      expect(publicVerify.status).toBe(200)
      expect(findQrTokenByGateCode).not.toHaveBeenCalled()
    } finally {
      await server.close()
    }
  })
})
