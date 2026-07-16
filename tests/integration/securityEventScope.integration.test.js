import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { authHeaders, buildStaffUser, createPrismaDouble, loginStaff } from './helpers/staffSession.js'
import { createSupabaseTestClient, listen } from './helpers/supabaseTestClient.js'

const EVENT_SLUG = 'pitbull-classic-2026'

describe('login de una cuenta seguridad_plu_arg atada a un evento', () => {
  it('acepta el eventSlug asignado y rechaza cualquier otro', async () => {
    const staffUser = await buildStaffUser({
      role: 'seguridad_plu_arg',
      eventId: 'evt-pitbull-2026',
      eventSlug: EVENT_SLUG,
    })
    const prisma = createPrismaDouble([staffUser])
    const target = listen(createApp({ prisma }))

    try {
      const ok = await loginStaff(target.url, { email: staffUser.email, eventSlug: EVENT_SLUG })
      expect(ok.cookie).toMatch(/^plu_session=/)

      await expect(
        loginStaff(target.url, { email: staffUser.email, eventSlug: 'otro-evento-2027' }),
      ).rejects.toThrow(/401/)
    } finally {
      await target.close()
    }
  })

  it('una cuenta seguridad_plu_arg sin evento asignado sigue entrando sin eventSlug (compatibilidad)', async () => {
    const staffUser = await buildStaffUser({ role: 'seguridad_plu_arg' })
    const prisma = createPrismaDouble([staffUser])
    const target = listen(createApp({ prisma }))

    try {
      const { cookie } = await loginStaff(target.url, { email: staffUser.email })
      expect(cookie).toMatch(/^plu_session=/)
    } finally {
      await target.close()
    }
  })
})

describe('check-in respeta el evento asignado a una cuenta seguridad_plu_arg', () => {
  const supabaseAdmin = createSupabaseTestClient()
  const createdOrderIds = []
  const createdTicketIds = []

  afterAll(async () => {
    if (createdOrderIds.length === 0) return
    if (createdTicketIds.length > 0) {
      await supabaseAdmin.from('check_ins').delete().in('ticket_id', createdTicketIds)
    }
    await supabaseAdmin.from('tickets').delete().in('order_id', createdOrderIds)
    await supabaseAdmin.from('ticket_orders').delete().in('id', createdOrderIds)
  })

  it('rechaza (403) el check-in de un ticket que no pertenece al evento asignado, y lo acepta (200) para el propio', async () => {
    const wrongEventStaff = await buildStaffUser({
      role: 'seguridad_plu_arg',
      email: 'seguridad-otro-evento@pluarg.test',
      eventId: 'evt-otro-evento',
      eventSlug: 'otro-evento-2027',
    })
    // Array mutable: agregamos la cuenta del evento correcto más abajo, una
    // vez que conocemos el eventId real del ticket creado.
    const users = [wrongEventStaff]
    const prisma = createPrismaDouble(users)
    const target = listen(createApp({ supabaseAdmin, prisma }))

    try {
      const { cookie: wrongEventCookie } = await loginStaff(target.url, {
        email: wrongEventStaff.email,
        eventSlug: 'otro-evento-2027',
      })

      const order = await fetch(`${target.url}/api/tickets/orders`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          eventSlug: EVENT_SLUG,
          provider: 'manual',
          idempotencyKey: randomUUID(),
          accessToken: randomBytes(32).toString('base64url'),
          attendees: [{ fullName: 'Test Scope Evento', dni: '30999777', dayPass: 'day1', addonIds: [] }],
        }),
      })
      const orderBody = await order.json()
      expect(order.status).toBe(201)
      createdOrderIds.push(orderBody.order.id)
      createdTicketIds.push(orderBody.tickets[0].id)
      const qrToken = orderBody.tickets[0].qr_token
      const ticketEventId = orderBody.tickets[0].event_id

      const { error: updateError } = await supabaseAdmin
        .from('tickets')
        .update({ status: 'pagada' })
        .eq('id', orderBody.tickets[0].id)
      expect(updateError).toBeNull()

      // La cuenta de seguridad de OTRO evento no puede marcar el ingreso.
      const forbidden = await fetch(`${target.url}/api/tickets/checkin/${qrToken}`, {
        method: 'POST',
        headers: authHeaders(wrongEventCookie),
        body: JSON.stringify({ gate: 'principal' }),
      })
      expect(forbidden.status).toBe(403)

      // La cuenta de seguridad del evento correcto SÍ puede.
      const rightEventStaff = await buildStaffUser({
        role: 'seguridad_plu_arg',
        email: 'seguridad-evento-correcto@pluarg.test',
        eventId: ticketEventId,
        eventSlug: EVENT_SLUG,
      })
      users.push(rightEventStaff)

      const { cookie: rightEventCookie } = await loginStaff(target.url, {
        email: rightEventStaff.email,
        eventSlug: EVENT_SLUG,
      })

      const allowed = await fetch(`${target.url}/api/tickets/checkin/${qrToken}`, {
        method: 'POST',
        headers: authHeaders(rightEventCookie),
        body: JSON.stringify({ gate: 'principal' }),
      })
      expect(allowed.status).toBe(200)
    } finally {
      await target.close()
    }
  })
})
