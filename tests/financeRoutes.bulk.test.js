import express from 'express'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Rutas del libro de caja del lado servidor: carga por lote y tolerancia a la
 * migración de ingresos sin aplicar. Se monta el router real con el cliente de
 * Supabase y los middlewares de auth/rate-limit reemplazados.
 */

vi.mock('../server/middleware/auth.js', () => ({
  requirePermission: () => [
    (req, _res, next) => {
      req.auth = { user: { id: 'staff-1' } }
      next()
    },
  ],
}))
vi.mock('../server/middleware/rateLimit.js', () => ({
  staffLimiter: (_req, _res, next) => next(),
}))

const { createFinanceRoutes } = await import('../server/routes/finance.js')

let server
let baseUrl

afterEach(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  server = undefined
  vi.restoreAllMocks()
})

beforeAll(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

/** Cliente de Supabase mínimo: `from(table).select()...` y `rpc(name, args)`. */
function fakeSupabase({ rpc = async () => ({ data: {}, error: null }), tables = {} } = {}) {
  const calls = []
  const query = (table) => {
    const result = tables[table] ?? { data: [], error: null }
    const chain = {
      select: () => chain,
      gte: () => chain,
      lte: () => chain,
      eq: () => chain,
      order: () => chain,
      then: (resolve) => resolve(result),
    }
    return chain
  }
  return {
    calls,
    client: {
      from: query,
      rpc: async (name, args) => {
        calls.push({ name, args })
        return rpc(name, args)
      },
    },
  }
}

async function start(supabase) {
  const app = express()
  app.use(express.json())
  app.use('/api/finance', createFinanceRoutes({ getPrisma: () => ({}), getSupabaseAdmin: () => supabase }))
  // Mismo criterio que el errorHandler global: los 5xx pierden su mensaje.
  app.use((err, _req, res, _next) => {
    const status = Number.isInteger(err.status) ? err.status : 500
    res.status(status).json({ error: status >= 500 ? 'Error interno' : err.message })
  })
  await new Promise((resolve) => {
    server = app.listen(0, resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
}

const entry = (overrides = {}) => ({
  kind: 'income',
  occurredOn: '2026-10-05',
  category: 'Sponsor',
  description: 'Aporte de marca',
  amount: 100000,
  ...overrides,
})

const post = (path, body) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/finance/entries/bulk', () => {
  it('carga cada fila por la RPC de su tipo y devuelve cuántas guardó', async () => {
    const { client, calls } = fakeSupabase()
    await start(client)

    const response = await post('/api/finance/entries/bulk', {
      entries: [entry(), entry({ kind: 'expense', category: 'Logística', amount: 9000 })],
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ created: 2 })
    expect(calls.map((call) => call.name)).toEqual([
      'create_financial_income',
      'create_financial_expense',
    ])
    expect(calls[0].args).toMatchObject({ p_amount: 100000, p_actor_id: 'staff-1' })
  })

  it('valida todo el lote antes de escribir: una fila mala no deja la mitad cargada', async () => {
    const { client, calls } = fakeSupabase()
    await start(client)

    const response = await post('/api/finance/entries/bulk', {
      entries: [entry(), entry({ amount: -5 })],
    })

    expect(response.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('rechaza un lote vacío o de más de 200 filas', async () => {
    const { client } = fakeSupabase()
    await start(client)

    expect((await post('/api/finance/entries/bulk', { entries: [] })).status).toBe(400)
    const tooMany = Array.from({ length: 201 }, () => entry())
    expect((await post('/api/finance/entries/bulk', { entries: tooMany })).status).toBe(400)
  })

  it('si la base falla a mitad de camino, informa cuántas quedaron cargadas', async () => {
    let count = 0
    const { client } = fakeSupabase({
      rpc: async () => {
        count += 1
        return count === 2
          ? { data: null, error: { code: 'XX000', message: 'boom' } }
          : { data: {}, error: null }
      },
    })
    await start(client)

    const response = await post('/api/finance/entries/bulk', {
      entries: [entry(), entry(), entry()],
    })

    expect(response.status).toBe(424)
    expect((await response.json()).error).toMatch(/se cargaron 1 de 3/i)
  })
})

describe('migración de ingresos manuales sin aplicar', () => {
  const missingTable = { data: null, error: { code: 'PGRST205', message: 'no table' } }

  it('el libro sigue sirviendo cobros y egresos cuando falta financial_incomes', async () => {
    const { client } = fakeSupabase({
      tables: {
        financial_incomes: missingTable,
        financial_expenses: {
          data: [
            {
              id: 'e1',
              occurred_on: '2026-10-05',
              category: 'Logística',
              description: 'Alquiler de plataforma',
              amount: 38000,
              currency: 'ARS',
            },
          ],
          error: null,
        },
      },
    })
    await start(client)

    const response = await fetch(`${baseUrl}/api/finance?from=2026-10-01&to=2026-10-31`)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.rows).toHaveLength(1)
    expect(body.totals).toMatchObject({ income: 0, expense: 38000, balance: -38000 })
  })

  it('cargar un ingreso explica qué falta en vez de "Error interno"', async () => {
    const { client } = fakeSupabase({
      rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'no function' } }),
    })
    await start(client)

    const response = await post('/api/finance/incomes', {
      occurredOn: '2026-10-05',
      category: 'Sponsor',
      description: 'Aporte de marca',
      amount: 100000,
    })

    expect(response.status).toBe(424)
    expect((await response.json()).error).toMatch(/migración financial_incomes/i)
  })
})
