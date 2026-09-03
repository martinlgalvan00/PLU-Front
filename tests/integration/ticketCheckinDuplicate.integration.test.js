import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { buildStaffUser, createPrismaDouble, loginStaff } from './helpers/staffSession.js'
import { createSupabaseTestClient, listen } from './helpers/supabaseTestClient.js'

const mutationHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
}

function authHeaders(cookie) {
  return { ...mutationHeaders, Cookie: cookie }
}

describe('check-in de tickets rechaza un segundo escaneo (unique constraint real)', () => {
  const supabaseAdmin = createSupabaseTestClient()
  // Evento y tipo de entrada propios del test (no dependen de supabase/seed.sql,
  // que solo se corre en dev local).
  const eventSlug = `checkin-smoke-${randomUUID()}`
  const createdOrderIds = []
  const createdTicketIds = []
  let eventId
  let ticketTypeId

  afterAll(async () => {
    if (createdTicketIds.length > 0) {
      await supabaseAdmin.from('check_ins').delete().in('ticket_id', createdTicketIds)
    }
    if (createdOrderIds.length > 0) {
      await supabaseAdmin.from('tickets').delete().in('order_id', createdOrderIds)
      await supabaseAdmin.from('ticket_orders').delete().in('id', createdOrderIds)
    }
    if (ticketTypeId) await supabaseAdmin.from('ticket_types').delete().eq('id', ticketTypeId)
    if (eventId) await supabaseAdmin.from('events').delete().eq('id', eventId)
  })

  it('primer check-in ok (200), segundo rechazado con 409/PLU06', async () => {
    // Rol seguridad_plu_arg -- el mismo rol que usa el staff de la puerta
    // en un evento real (ver src/lib/constants.js checkinOnly).
    const staffUser = await buildStaffUser({ role: 'seguridad_plu_arg' })
    const prisma = createPrismaDouble([staffUser])
    const target = listen(createApp({ supabaseAdmin, prisma }))

    try {
      const { cookie } = await loginStaff(target.url, { email: staffUser.email })

      const { data: event, error: eventError } = await supabaseAdmin
        .from('events')
        .insert({
          slug: eventSlug,
          title: 'Checkin Smoke Event',
          venue: 'Test',
          location: 'Test',
          starts_at: new Date(Date.now() + 86400000).toISOString(),
          ends_at: new Date(Date.now() + 2 * 86400000).toISOString(),
          published: true,
          status: 'cupos_limitados',
          rules: { ticketsEnabled: true },
        })
        .select('id')
        .single()
      expect(eventError).toBeNull()
      eventId = event.id

      const { data: ticketType, error: ticketTypeError } = await supabaseAdmin
        .from('ticket_types')
        .insert({ event_id: eventId, name: 'Día 2', price: 12000 })
        .select('id')
        .single()
      expect(ticketTypeError).toBeNull()
      ticketTypeId = ticketType.id

      const order = await fetch(`${target.url}/api/tickets/orders`, {
        method: 'POST',
        headers: mutationHeaders,
        body: JSON.stringify({
          eventSlug,
          provider: 'manual',
          idempotencyKey: randomUUID(),
          accessToken: randomBytes(32).toString('base64url'),
          attendees: [
            { fullName: 'Test Checkin Duplicado', dni: '30999888', ticketTypeId, addonIds: [] },
          ],
        }),
      })
      const orderBody = await order.json()
      expect(order.status).toBe(201)
      createdOrderIds.push(orderBody.order.id)
      createdTicketIds.push(orderBody.tickets[0].id)
      const qrToken = orderBody.tickets[0].qr_token

      // Salteamos el flujo de comprobante/aprobación manual (no es lo que
      // este test ejercita) y llevamos el ticket a 'pagada' directo con el
      // cliente service_role real -- mismo patrón que ya usa
      // supabase/tests/payment_state_machine.sql para fixtures.
      const { error: updateError } = await supabaseAdmin
        .from('tickets')
        .update({ status: 'pagada' })
        .eq('id', orderBody.tickets[0].id)
      expect(updateError).toBeNull()

      const first = await fetch(`${target.url}/api/tickets/checkin/${qrToken}`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ gate: 'principal' }),
      })
      expect(first.status).toBe(200)

      const second = await fetch(`${target.url}/api/tickets/checkin/${qrToken}`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ gate: 'principal' }),
      })
      const secondBody = await second.json()

      expect(second.status).toBe(409)
      expect(secondBody.code).toBe('PLU06')
      expect(secondBody.alreadyUsed).toBe(true)
    } finally {
      await target.close()
    }
  })
})
