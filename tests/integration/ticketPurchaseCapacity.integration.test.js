import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { createSupabaseTestClient, listen } from './helpers/supabaseTestClient.js'

const mutationHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
}

function buildAttendees(count, ticketTypeId) {
  return Array.from({ length: count }, (_, index) => ({
    fullName: `Test Capacity ${index}`,
    dni: String(30000000 + index),
    ticketTypeId,
    addonIds: [],
  }))
}

function buyOrder(baseUrl, eventSlug, attendees) {
  return fetch(`${baseUrl}/api/tickets/orders`, {
    method: 'POST',
    headers: mutationHeaders,
    body: JSON.stringify({
      eventSlug,
      provider: 'manual',
      idempotencyKey: randomUUID(),
      accessToken: randomBytes(32).toString('base64url'),
      attendees,
    }),
  })
}

describe('compra de tickets respeta el cupo real por tipo de entrada (RPC create_ticket_order_v2)', () => {
  const supabaseAdmin = createSupabaseTestClient()
  // Evento y tipo de entrada propios del test (no dependen de supabase/seed.sql,
  // que solo se corre en dev local, ni del estado mutable de un evento real).
  const eventSlug = `capacity-smoke-${randomUUID()}`
  const createdOrderIds = []
  let eventId
  let ticketTypeId

  afterAll(async () => {
    if (createdOrderIds.length > 0) {
      await supabaseAdmin.from('tickets').delete().in('order_id', createdOrderIds)
      await supabaseAdmin.from('ticket_orders').delete().in('id', createdOrderIds)
    }
    if (ticketTypeId) await supabaseAdmin.from('ticket_types').delete().eq('id', ticketTypeId)
    if (eventId) await supabaseAdmin.from('events').delete().eq('id', eventId)
  })

  it('acepta hasta llenar el cupo del tipo de entrada y rechaza el siguiente intento con 409/PLU04', async () => {
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .insert({
        slug: eventSlug,
        title: 'Capacity Smoke Event',
        venue: 'Test',
        location: 'Test',
        starts_at: new Date(Date.now() + 86400000).toISOString(),
        ends_at: new Date(Date.now() + 2 * 86400000).toISOString(),
        published: true,
        status: 'cupos_limitados',
      })
      .select('id')
      .single()
    expect(eventError).toBeNull()
    eventId = event.id

    const { data: ticketType, error: ticketTypeError } = await supabaseAdmin
      .from('ticket_types')
      .insert({ event_id: eventId, name: 'Día 1', price: 12000, quota: 8 })
      .select('id')
      .single()
    expect(ticketTypeError).toBeNull()
    ticketTypeId = ticketType.id

    const target = listen(createApp({ supabaseAdmin }))

    try {
      const fill = await buyOrder(target.url, eventSlug, buildAttendees(8, ticketTypeId))
      const fillBody = await fill.json()
      expect(fill.status).toBe(201)
      createdOrderIds.push(fillBody.order.id)
      expect(fillBody.tickets).toHaveLength(8)

      const overflow = await buyOrder(target.url, eventSlug, buildAttendees(1, ticketTypeId))
      const overflowBody = await overflow.json()

      expect(overflow.status).toBe(409)
      expect(overflowBody.code).toBe('PLU04')
      expect(overflowBody.error).toMatch(/Entradas agotadas para Día 1/i)
    } finally {
      await target.close()
    }
  })
})
