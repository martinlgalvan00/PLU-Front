import { describe, expect, it } from 'vitest'
import { createSupabaseTicketRepository } from '../server/modules/ticketing/supabaseTicketRepository.js'
import {
  documentKey,
  legacyEmailClaim,
  serializeAccountTickets,
} from '../server/modules/ticketing/accountTickets.js'

function scriptedClient(dataFor) {
  const calls = []
  function builder(table) {
    const record = { table, ops: [] }
    calls.push(record)
    const api = {
      select() {
        return api
      },
      eq(column, value) {
        record.ops.push(['eq', column, value])
        return api
      },
      is(column, value) {
        record.ops.push(['is', column, value])
        return api
      },
      ilike(column, value) {
        record.ops.push(['ilike', column, value])
        return api
      },
      in(column, value) {
        record.ops.push(['in', column, value])
        return api
      },
      order() {
        return api
      },
      limit() {
        return api
      },
      update(patch) {
        record.ops.push(['update', patch])
        return api
      },
      then(resolve, reject) {
        return Promise.resolve({ data: dataFor(record) ?? [], error: null }).then(resolve, reject)
      },
    }
    return api
  }
  return { calls, from: (table) => builder(table) }
}

const athlete = {
  kind: 'athlete',
  id: '11111111-1111-4111-8111-111111111111',
  email: 'camila@example.com',
  emailVerified: false,
  documentKeys: ['30111222'],
}

describe('entradas de la cuenta', () => {
  it('normaliza el documento igual que la columna generada', () => {
    expect(documentKey('12.345.678')).toBe('12345678')
    expect(documentKey('  ab-12 ')).toBe('AB12')
    expect(documentKey('')).toBeNull()
  })

  it('el mail sin verificar no reclama compras viejas', () => {
    expect(legacyEmailClaim(athlete)).toBeNull()
    expect(legacyEmailClaim({ ...athlete, emailVerified: true })).toBe('camila@example.com')
    expect(legacyEmailClaim({ ...athlete, kind: 'staff', emailVerified: true })).toBeNull()
  })

  it('no consulta el mail si la cuenta no está verificada', async () => {
    const client = scriptedClient(() => [])
    const repo = createSupabaseTicketRepository(client)
    await repo.listTicketsForAccount(athlete)
    const orderReads = client.calls.filter((call) => call.table === 'ticket_orders')
    expect(orderReads).toHaveLength(1)
    expect(orderReads[0].ops).toContainEqual(['eq', 'buyer_athlete_id', athlete.id])
    expect(orderReads.some((call) => call.ops.some((op) => op[0] === 'ilike'))).toBe(false)
    expect(
      client.calls.some((call) =>
        call.ops.some((op) => op[0] === 'in' && op[1] === 'attendee_document_key'),
      ),
    ).toBe(true)
  })

  it('reclama por mail sólo las órdenes huérfanas de un atleta verificado', async () => {
    const client = scriptedClient(() => [])
    const repo = createSupabaseTicketRepository(client)
    await repo.listTicketsForAccount({ ...athlete, emailVerified: true })
    const claim = client.calls.find((call) => call.ops.some((op) => op[0] === 'ilike'))
    expect(claim.ops).toContainEqual(['is', 'buyer_athlete_id', null])
    expect(claim.ops).toContainEqual(['is', 'buyer_staff_user_id', null])
    expect(claim.ops).toContainEqual(['ilike', 'buyer_email', 'camila@example.com'])
  })

  it('no duplica la entrada que ya está en una orden del comprador', async () => {
    const client = scriptedClient((record) => {
      if (record.table === 'ticket_orders') {
        return [{ id: 'order-1', status: 'aprobado', reference: 'TORD-1' }]
      }
      if (record.ops.some((op) => op[1] === 'order_id')) {
        return [{ id: 't1', order_id: 'order-1', attendee_name: 'Camila' }]
      }
      return [
        {
          id: 't1',
          order_id: 'order-1',
          attendee_name: 'Camila',
          order: { id: 'order-1', status: 'aprobado', reference: 'TORD-1' },
        },
        {
          id: 't2',
          order_id: 'order-2',
          attendee_name: 'Otra persona',
          order: { id: 'order-2', status: 'aprobado', reference: 'TORD-2' },
        },
      ]
    })
    const repo = createSupabaseTicketRepository(client)
    const found = await repo.listTicketsForAccount(athlete)
    expect(found.buyerOrders).toHaveLength(1)
    expect(found.buyerOrders[0].tickets.map((ticket) => ticket.id)).toEqual(['t1'])
    expect(found.attendeeTickets.map((item) => item.ticket.id)).toEqual(['t2'])
  })

  it('no pisa un dueño y se degrada si la columna todavía no existe', async () => {
    const client = scriptedClient(() => [])
    const repo = createSupabaseTicketRepository(client)
    await repo.attachBuyerAccount('order-1', athlete)
    const update = client.calls.find((call) => call.ops.some((op) => op[0] === 'update'))
    expect(update.ops).toContainEqual(['update', { buyer_athlete_id: athlete.id }])
    expect(update.ops).toContainEqual(['is', 'buyer_athlete_id', null])
    expect(update.ops).toContainEqual(['is', 'buyer_staff_user_id', null])

    const missing = {
      from: () => ({
        update: () => {
          const api = {
            eq() {
              return api
            },
            is() {
              return api
            },
            then(resolve, reject) {
              return Promise.resolve({
                data: null,
                error: { code: '42703', message: 'column buyer_athlete_id does not exist' },
              }).then(resolve, reject)
            },
          }
          return api
        },
      }),
    }
    const degraded = createSupabaseTicketRepository(missing)
    await expect(degraded.attachBuyerAccount('order-1', athlete)).resolves.toBeNull()
  })

  it('una orden pendiente no lleva el QR', () => {
    const body = serializeAccountTickets({
      buyerOrders: [
        {
          order: {
            status: 'pendiente',
            reference: 'TORD-1',
            buyer_email: 'secret-buyer@example.com',
            event: { title: 'Pitbull', slug: 'pitbull', starts_at: null, venue: null },
          },
          tickets: [
            {
              id: 't1',
              order_id: 'order-1',
              qr_token: 'secret-qr',
              gate_code: 'AAA-BBB',
              ticket_code: 'TCK-1',
              attendee_name: 'Camila',
              status: 'pendiente_pago',
            },
          ],
        },
      ],
      attendeeTickets: [],
    })
    expect(body.orders[0].tickets[0].qr_token).toBeNull()
    expect(body.orders[0].tickets[0].gate_code).toBeNull()
    expect(body.orders[0].tickets[0].ticket_code).toBeNull()
    expect(JSON.stringify(body)).not.toContain('secret-buyer@example.com')
    expect(JSON.stringify(body)).not.toContain('secret-qr')
  })
})
