import { describe, expect, it } from 'vitest'
import { createSupabaseAuditRepository } from '../server/modules/audit/supabaseAuditRepository.js'

/**
 * La bitácora pagina por cursor. Una transacción de dominio audita varios
 * efectos con el mismo `now()`, así que el cursor por `created_at` solo no es
 * un orden total: la página siguiente saltea las filas empatadas con la
 * última devuelta. Estos tests fijan el cursor compuesto (fecha, id).
 */

function createQueryDouble(rows = []) {
  const calls = { order: [], or: [], lt: [] }
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    order(column, options) {
      calls.order.push([column, options])
      return query
    },
    limit: () => query,
    or(expression) {
      calls.or.push(expression)
      return query
    },
    lt(column, value) {
      calls.lt.push([column, value])
      return query
    },
    then(resolve) {
      resolve({ data: rows, error: null })
    },
  }
  return { query, calls }
}

function createClientDouble(rows = []) {
  const { query, calls } = createQueryDouble(rows)
  return {
    client: {
      from: () => query,
      rpc: async () => ({ data: {}, error: null }),
    },
    calls,
  }
}

describe('createSupabaseAuditRepository · cursor de paginación', () => {
  it('ordena por (created_at, id) para desempatar filas del mismo instante', async () => {
    const { client, calls } = createClientDouble()
    const repository = createSupabaseAuditRepository(client)

    await repository.list()

    expect(calls.order).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
  })

  it('usa un or compuesto cuando llegan before y beforeId', async () => {
    const { client, calls } = createClientDouble()
    const repository = createSupabaseAuditRepository(client)

    await repository.list({ before: '2026-08-02T12:00:00.000Z', beforeId: 'row-42' })

    expect(calls.lt).toHaveLength(0)
    expect(calls.or).toEqual([
      'created_at.lt.2026-08-02T12:00:00.000Z,and(created_at.eq.2026-08-02T12:00:00.000Z,id.lt.row-42)',
    ])
  })

  it('mantiene el filtro por fecha sola para llamadas legacy sin beforeId', async () => {
    const { client, calls } = createClientDouble()
    const repository = createSupabaseAuditRepository(client)

    await repository.list({ before: '2026-08-02T12:00:00.000Z' })

    expect(calls.lt).toEqual([['created_at', '2026-08-02T12:00:00.000Z']])
    expect(calls.or).toHaveLength(0)
  })

  it('combina el cursor compuesto con la búsqueda sin pisarse', async () => {
    const { client, calls } = createClientDouble()
    const repository = createSupabaseAuditRepository(client)

    await repository.list({ before: '2026-08-02T12:00:00.000Z', beforeId: 'row-42', search: 'ana' })

    expect(calls.or).toHaveLength(2)
    expect(calls.or[0]).toContain('created_at.lt.2026-08-02T12:00:00.000Z')
    expect(calls.or[1]).toBe('entity_id.ilike.%ana%,actor_id.ilike.%ana%')
  })
})
