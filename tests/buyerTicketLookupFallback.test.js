import { describe, expect, it } from 'vitest'
import { createSupabaseTicketRepository } from '../server/modules/ticketing/supabaseTicketRepository.js'

function clientWith(script) {
  const calls = []
  let step = 0
  const client = {
    from(table) {
      const state = { table, columns: '' }
      const finish = () => {
        calls.push({ table, columns: state.columns })
        const next = script[step]
        step += 1
        if (!next) throw new Error(`Sin respuesta para ${table}`)
        return Promise.resolve(next)
      }
      const chain = {
        select(columns) {
          state.columns = columns
          return chain
        },
        eq() {
          return chain
        },
        ilike() {
          return chain
        },
        order: finish,
        maybeSingle: finish,
      }
      return chain
    },
  }
  return { client, calls }
}

const order = {
  id: 'order-1',
  status: 'aprobado',
  reference: 'TORD-abc',
  buyer_email: 'a@b.c',
  event: { title: 'Pitbull', slug: 'pitbull' },
}

const ticket = {
  id: 't1',
  order_id: 'order-1',
  ticket_code: 'PLU-1',
  qr_token: 'qr-1',
  attendee_name: 'Camila',
  ticket_types: { name: 'Espectador' },
}

describe('lookup de entradas si la base no tiene las jornadas', () => {
  it('sigue devolviendo el QR cuando el embed de jornadas no existe', async () => {
    const missing = {
      data: null,
      error: { code: 'PGRST200', message: 'Could not find a relationship in the schema cache' },
    }
    const { client, calls } = clientWith([
      { data: order, error: null },
      missing,
      missing,
      { data: [ticket], error: null },
    ])
    const found = await createSupabaseTicketRepository(client).findOrderByReferenceAndEmail(
      'TORD-abc',
      'a@b.c',
    )
    expect(found.tickets).toEqual([ticket])
    expect(found.tickets[0].qr_token).toBe('qr-1')
    expect(calls.filter((call) => call.table === 'tickets')).toHaveLength(3)
    expect(calls.at(-1).columns).not.toContain('ticket_type_days')
  })

  it('no reintenta un error que no es de esquema', async () => {
    const { client, calls } = clientWith([
      { data: order, error: null },
      { data: null, error: { code: '42501', message: 'permission denied' } },
    ])
    await expect(
      createSupabaseTicketRepository(client).findOrderByReferenceAndEmail('TORD-abc', 'a@b.c'),
    ).rejects.toThrow(/permission denied/)
    expect(calls.filter((call) => call.table === 'tickets')).toHaveLength(1)
  })

  it('busca la orden sin fecha ni sede si esas columnas no están', async () => {
    const { client } = clientWith([
      { data: null, error: { code: 'PGRST204', message: "Could not find the 'starts_at' column" } },
      { data: order, error: null },
      { data: [ticket], error: null },
    ])
    const found = await createSupabaseTicketRepository(client).findOrderByReference(
      'TORD-abc',
    )
    expect(found.order.reference).toBe('TORD-abc')
    expect(found.tickets[0].qr_token).toBe('qr-1')
  })
})
