import { describe, expect, it } from 'vitest'
import {
  emptyTrash,
  listTrash,
  purgeFiles,
  purgeTrashedFile,
  restoreProofFile,
  trashFilesOfOrders,
  trashOrderProof,
} from '../server/modules/payments/paymentProofTrash.js'

/**
 * Doble de supabase-js para la papelera. `filesQueue` entrega una respuesta de
 * `payment_proof_files` por cada lectura (la última se repite); `failBuckets`
 * hace fallar `remove` en esos buckets.
 */
function fakeClient({
  filesQueue = [[]],
  count = null,
  orders = {},
  rpcs = {},
  failBuckets = [],
} = {}) {
  const calls = { rpcs: [], removes: [], reads: 0 }
  const chain = (result) =>
    new Proxy(function () {}, {
      get: (_, prop) =>
        prop === 'then'
          ? (resolve, reject) => Promise.resolve(result).then(resolve, reject)
          : () => chain(result),
    })
  return {
    calls,
    from: (table) => {
      if (table === 'payment_proof_files') {
        const rows = filesQueue[Math.min(calls.reads, filesQueue.length - 1)]
        calls.reads += 1
        return chain({ data: rows, error: null, count })
      }
      return chain({ data: orders[table] ?? [], error: null })
    },
    rpc: async (name, args) => {
      calls.rpcs.push({ name, args })
      const handler = rpcs[name]
      if (handler?.error) return { data: null, error: handler.error }
      return { data: typeof handler === 'function' ? handler(args) : handler, error: null }
    },
    storage: {
      from: (bucket) => ({
        remove: async (paths) => {
          calls.removes.push({ bucket, paths })
          return failBuckets.includes(bucket)
            ? { data: null, error: { message: 'storage caído' } }
            : { data: [], error: null }
        },
      }),
    },
  }
}

const file = (id, bucket = 'athlete-payment-proofs') => ({ id, bucket, path: `${id}/x.png` })

describe('purgeFiles', () => {
  it('borra por bucket en tandas de 100 y marca sólo lo que Storage confirmó', async () => {
    const files = Array.from({ length: 250 }, (_, i) => file(`a${i}`))
    const client = fakeClient({ rpcs: { proof_mark_purged: 250 } })
    const result = await purgeFiles(client, files)

    expect(client.calls.removes.map((call) => call.paths.length)).toEqual([100, 100, 50])
    expect(client.calls.rpcs).toHaveLength(1)
    expect(client.calls.rpcs[0].args.p_file_ids).toHaveLength(250)
    expect(result).toMatchObject({ purged: 250, failed: 0 })
  })

  it('un bucket que falla no arrastra a los demás ni se marca como purgado', async () => {
    const client = fakeClient({
      rpcs: { proof_mark_purged: 1 },
      failBuckets: ['ticket-payment-proofs'],
    })
    const result = await purgeFiles(client, [
      file('ok', 'athlete-payment-proofs'),
      file('mal', 'ticket-payment-proofs'),
    ])

    expect(client.calls.rpcs[0].args.p_file_ids).toEqual(['ok'])
    expect(result).toMatchObject({ purged: 1, failed: 1 })
    expect(result.errors[0]).toMatchObject({ bucket: 'ticket-payment-proofs', message: 'storage caído' })
  })

  it('sin nada que borrar no llama a la base', async () => {
    const client = fakeClient()
    expect(await purgeFiles(client, [])).toMatchObject({ purged: 0, failed: 0 })
    expect(client.calls.rpcs).toHaveLength(0)
  })
})

describe('purgeTrashedFile', () => {
  it('un archivo que no está en la papelera responde 404 y no toca Storage', async () => {
    const client = fakeClient({ filesQueue: [null] })
    await expect(purgeTrashedFile(client, 'x')).rejects.toMatchObject({ status: 404 })
    expect(client.calls.removes).toHaveLength(0)
  })

  it('si Storage falla avisa (502) y no lo da por eliminado', async () => {
    const client = fakeClient({
      filesQueue: [file('f1')],
      failBuckets: ['athlete-payment-proofs'],
    })
    await expect(purgeTrashedFile(client, 'f1')).rejects.toMatchObject({ status: 502 })
    expect(client.calls.rpcs).toHaveLength(0)
  })
})

describe('emptyTrash', () => {
  it('sigue por tandas hasta que la papelera queda vacía', async () => {
    const client = fakeClient({
      filesQueue: [[file('a'), file('b')], [file('c')], []],
      rpcs: { proof_mark_purged: (args) => args.p_file_ids.length },
    })
    const result = await emptyTrash(client)
    expect(result).toMatchObject({ purged: 3, failed: 0 })
    expect(client.calls.removes).toHaveLength(2)
  })

  it('si una tanda no logra purgar nada, corta en vez de repetir para siempre', async () => {
    const client = fakeClient({
      filesQueue: [[file('a')]], // siempre devuelve el mismo archivo
      failBuckets: ['athlete-payment-proofs'],
    })
    const result = await emptyTrash(client, { maxBatches: 50 })
    expect(result).toMatchObject({ purged: 0, failed: 1 })
    expect(client.calls.removes).toHaveLength(1)
  })
})

describe('papelera: RPC', () => {
  it('trashOrderProof pide la baja con el origen, la orden y quién la hace', async () => {
    const client = fakeClient({ rpcs: { proof_trash: { trashed: true, fileId: 'f9' } } })
    const result = await trashOrderProof(client, { source: 'ticket', orderId: 'o1', actor: 'u1:a@b' })
    expect(client.calls.rpcs[0]).toEqual({
      name: 'proof_trash',
      args: { p_source: 'ticket', p_order_id: 'o1', p_actor: 'u1:a@b' },
    })
    expect(result).toEqual({ trashed: true, fileId: 'f9' })
  })

  it('una orden que todavía espera decisión devuelve el mensaje de la base como conflicto', async () => {
    const client = fakeClient({
      rpcs: {
        proof_trash: {
          error: { code: 'PLU10', message: 'Solo se puede mover a la papelera el comprobante de una orden ya resuelta.' },
        },
      },
    })
    await expect(trashOrderProof(client, { source: 'athlete', orderId: 'o1' })).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('orden ya resuelta'),
    })
  })

  it('restaurar rechazado por la base (orden con otro comprobante) sale como 409', async () => {
    const client = fakeClient({
      rpcs: { proof_restore: { error: { code: 'PLU10', message: 'La orden ya tiene otro comprobante.' } } },
    })
    await expect(restoreProofFile(client, { fileId: 'f1' })).rejects.toMatchObject({ status: 409 })
  })

  it('trashFilesOfOrders sin órdenes no llama a la base', async () => {
    const client = fakeClient()
    expect(await trashFilesOfOrders(client, { orderIds: [] })).toBe(0)
    expect(client.calls.rpcs).toHaveLength(0)

    const withOrders = fakeClient({ rpcs: { proof_trash_order_files: 2 } })
    expect(await trashFilesOfOrders(withOrders, { orderIds: ['a', 'b'], actor: 'root' })).toBe(2)
    expect(withOrders.calls.rpcs[0].args).toEqual({
      p_order_ids: ['a', 'b'],
      p_reason: 'athlete_deleted',
      p_actor: 'root',
    })
  })
})

describe('listTrash', () => {
  const now = new Date('2026-10-13T12:00:00Z')
  const row = (id, orderId, deletedAt, source = 'athlete') => ({
    id,
    source,
    order_id: orderId,
    bucket: 'athlete-payment-proofs',
    path: `${orderId}/x.png`,
    uploaded_at: '2026-09-01T00:00:00Z',
    exported_at: null,
    deleted_at: deletedAt,
    deleted_by: 'u1:a@b',
    deleted_reason: 'manual',
  })

  it('identifica cada archivo con su orden y calcula cuándo se borra', async () => {
    const client = fakeClient({
      filesQueue: [[row('f1', 'o1', '2026-10-10T12:00:00Z')]],
      count: 1,
      orders: {
        athlete_payment_orders: [
          {
            id: 'o1',
            reference: 'RORD-1',
            amount: 100,
            currency: 'ARS',
            status: 'aprobado',
            athlete: { full_name: 'Ana Pérez' },
          },
        ],
      },
    })
    const { items, total } = await listTrash(client, { graceDays: 30, now })

    expect(total).toBe(1)
    expect(items[0]).toMatchObject({
      id: 'f1',
      reference: 'RORD-1',
      person: 'Ana Pérez',
      reason: 'manual',
      purgeAt: '2026-11-09T12:00:00.000Z',
      restorable: true,
    })
  })

  it('no ofrece restaurar si la orden ya no existe o venció la gracia', async () => {
    const client = fakeClient({
      filesQueue: [
        [
          row('sin-orden', 'o-borrada', '2026-10-12T12:00:00Z'),
          row('vencido', 'o1', '2026-08-01T12:00:00Z'),
        ],
      ],
      orders: { athlete_payment_orders: [{ id: 'o1', status: 'aprobado' }] },
    })
    const { items } = await listTrash(client, { graceDays: 30, now })
    expect(items.map((item) => [item.id, item.restorable])).toEqual([
      ['sin-orden', false],
      ['vencido', false],
    ])
  })
})
