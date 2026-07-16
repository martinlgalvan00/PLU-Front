import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { createSupabaseTestClient, listen } from './helpers/supabaseTestClient.js'

// Evento sembrado por supabase/seed.sql: cupo day1=8 pensado exactamente
// para este test (ver el comentario del seed).
const EVENT_SLUG = 'pitbull-classic-2026'

const mutationHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
}

function buildAttendees(count, dayPass = 'day1') {
  return Array.from({ length: count }, (_, index) => ({
    fullName: `Test Capacity ${index}`,
    dni: String(30000000 + index),
    dayPass,
    addonIds: [],
  }))
}

function buyOrder(baseUrl, attendees) {
  return fetch(`${baseUrl}/api/tickets/orders`, {
    method: 'POST',
    headers: mutationHeaders,
    body: JSON.stringify({
      eventSlug: EVENT_SLUG,
      provider: 'manual',
      idempotencyKey: randomUUID(),
      accessToken: randomBytes(32).toString('base64url'),
      attendees,
    }),
  })
}

describe('compra de tickets respeta el cupo real por día (RPC create_ticket_order_v2)', () => {
  const supabaseAdmin = createSupabaseTestClient()
  const createdOrderIds = []

  afterAll(async () => {
    if (createdOrderIds.length === 0) return
    await supabaseAdmin.from('tickets').delete().in('order_id', createdOrderIds)
    await supabaseAdmin.from('ticket_orders').delete().in('id', createdOrderIds)
  })

  it('acepta hasta llenar el cupo de day1 y rechaza el siguiente intento con 409/PLU04', async () => {
    const target = listen(createApp({ supabaseAdmin }))

    try {
      const fill = await buyOrder(target.url, buildAttendees(8))
      const fillBody = await fill.json()
      expect(fill.status).toBe(201)
      createdOrderIds.push(fillBody.order.id)
      expect(fillBody.tickets).toHaveLength(8)

      const overflow = await buyOrder(target.url, buildAttendees(1))
      const overflowBody = await overflow.json()

      expect(overflow.status).toBe(409)
      expect(overflowBody.code).toBe('PLU04')
      expect(overflowBody.error).toMatch(/Entradas agotadas para day1/i)
    } finally {
      await target.close()
    }
  })
})
