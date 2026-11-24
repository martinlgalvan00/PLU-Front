import { describe, expect, it } from 'vitest'
import { crc32 } from 'node:zlib'
import { createZip } from '../server/lib/zipStore.js'
import {
  exportProofs,
  proofFileName,
  proofFileState,
} from '../server/modules/payments/paymentProofArchive.js'

/** Lee el directorio central de un ZIP y devuelve nombre, tamaño y CRC de cada entrada. */
function readZip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const total = buffer.readUInt16LE(end + 10)
  let offset = buffer.readUInt32LE(end + 16)
  const entries = []
  for (let i = 0; i < total; i += 1) {
    expect(buffer.readUInt32LE(offset)).toBe(0x02014b50)
    const crc = buffer.readUInt32LE(offset + 16)
    const size = buffer.readUInt32LE(offset + 24)
    const nameLen = buffer.readUInt16LE(offset + 28)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.subarray(offset + 46, offset + 46 + nameLen).toString('utf8')
    const localNameLen = buffer.readUInt16LE(localOffset + 26)
    const dataStart = localOffset + 30 + localNameLen
    entries.push({ name, size, crc, data: buffer.subarray(dataStart, dataStart + size) })
    offset += 46 + nameLen
  }
  return entries
}

describe('zipStore', () => {
  it('arma un ZIP legible con nombres con tildes y datos íntegros', () => {
    const a = Buffer.from('comprobante uno')
    const b = Buffer.from([0, 1, 2, 3, 250, 251, 252])
    const entries = readZip(
      createZip([
        { name: 'comprobantes/2026-10-09_Lucía.png', data: a },
        { name: 'indice.csv', data: b },
      ]),
    )
    expect(entries.map((e) => e.name)).toEqual(['comprobantes/2026-10-09_Lucía.png', 'indice.csv'])
    expect(entries[0].data.equals(a)).toBe(true)
    expect(entries[1].data.equals(b)).toBe(true)
    expect(entries[0].crc).toBe(crc32(a))
  })
})

describe('proofFileState / proofFileName', () => {
  it('distingue servidor, descargado, eliminado y sin comprobante', () => {
    expect(proofFileState({ payment_proof_path: 'a/b.png' })).toBe('server')
    expect(
      proofFileState({ payment_proof_path: 'a/b.png', payment_proof_exported_at: '2026-10-01' }),
    ).toBe('downloaded')
    expect(
      proofFileState({ payment_proof_path: null, payment_proof_purged_at: '2026-10-01' }),
    ).toBe('deleted')
    expect(proofFileState({ payment_proof_path: null })).toBe('none')
  })

  it('arma un nombre ordenable por fecha, sin tildes ni espacios', () => {
    expect(
      proofFileName({
        id: 'x',
        reference: 'RORD-ca7eb9266bda620c',
        approved_at: '2026-10-10T19:55:00Z',
        payment_proof_path: 'uuid/1788-IMG_2218.PNG',
        athlete: { full_name: 'Lucía Fernández Núñez' },
      }),
    ).toBe('comprobantes/atletas/2026-10-10_lucia-fernandez-nunez_b9266bda620c.png')
  })

  it('las entradas van en su propia carpeta, con el nombre del comprador', () => {
    expect(
      proofFileName({
        id: 't',
        source: 'ticket',
        reference: 'TORD-1234567890ab',
        approved_at: '2026-10-11T10:00:00Z',
        payment_proof_path: 'x/comprobante.jpg',
        buyer_name: 'Marcos Gómez',
      }),
    ).toBe('comprobantes/entradas/2026-10-11_marcos-gomez_1234567890ab.jpg')
  })
})

/** Doble mínimo de supabase-js para `exportProofs`. */
function fakeClient({ orders, ticketOrders = [], files }) {
  const updates = []
  const query = (rows) => {
    const api = {
      select: () => api,
      eq: () => api,
      not: () => api,
      is: () => api,
      gt: (column, value) => {
        api.after = { column, value }
        return api
      },
      order: () => api,
      limit: async () => ({ data: rows, error: null }),
      update: (patch) => {
        const filter = { patch }
        const chain = {
          in: (_column, ids) => {
            filter.ids = ids
            return chain
          },
          is: async () => {
            updates.push(filter)
            return { error: null }
          },
        }
        return chain
      },
    }
    return api
  }
  return {
    updates,
    from: (table) => query(table === 'ticket_orders' ? ticketOrders : orders),
    storage: {
      from: () => ({
        download: async (path) =>
          files[path] == null
            ? { data: null, error: { message: 'Object not found' } }
            : {
                // jsdom no implementa Blob#arrayBuffer: se simula lo que usa el módulo.
                data: {
                  arrayBuffer: async () =>
                    files[path].buffer.slice(
                      files[path].byteOffset,
                      files[path].byteOffset + files[path].byteLength,
                    ),
                },
                error: null,
              },
      }),
    },
  }
}

describe('exportProofs', () => {
  const order = (id, path) => ({
    id,
    reference: `RORD-${id}`,
    concept: 'registration',
    amount: 100000,
    currency: 'ARS',
    method: 'manual_link',
    manual_payment_channel: 'bank_transfer',
    status: 'aprobado',
    created_at: '2026-10-09T10:00:00Z',
    approved_at: '2026-10-09T12:00:00Z',
    payment_proof_path: path,
    payment_proof_uploaded_at: '2026-10-09T11:00:00Z',
    payment_proof_exported_at: null,
    payment_proof_purged_at: null,
    athlete: { full_name: 'Ana Pérez', document_id: '30111222' },
  })

  it('incluye el índice y marca como descargados sólo los que pudo leer', async () => {
    const client = fakeClient({
      orders: [order('aaaaaaaa11', 'o1/a.png'), order('bbbbbbbb22', 'o2/b.pdf')],
      files: { 'o1/a.png': Buffer.from('imagen') }, // el segundo ya no existe en Storage
    })
    const result = await exportProofs(client, {
      scope: 'pending',
      now: new Date('2026-10-13T12:00:00Z'),
    })

    expect(result.count).toBe(1)
    expect(result.failed).toBe(1)
    const zip = readZip(result.zip)
    expect(zip.map((e) => e.name)).toEqual([
      expect.stringMatching(/^comprobantes\/atletas\/2026-10-09_ana-perez_.*\.png$/),
      'indice.csv',
    ])
    const csv = zip[1].data.toString('utf8')
    expect(csv).toContain('Ana Pérez')
    expect(csv).toContain('30111222')
    expect(csv.split('\r\n')[0]).toContain('Referencia')

    // Sólo la orden descargada queda marcada: la que no se pudo leer sigue pendiente.
    expect(client.updates).toHaveLength(1)
    expect(client.updates[0].ids).toEqual(['aaaaaaaa11'])
    expect(client.updates[0].patch.payment_proof_exported_at).toBe('2026-10-13T12:00:00.000Z')
  })

  it('baja también los comprobantes de entradas y los marca en su tabla', async () => {
    const ticket = {
      id: 'tttttttt44',
      reference: 'TORD-tttttttt44',
      amount: 50000,
      currency: 'ARS',
      provider: 'manual',
      manual_payment_channel: 'bank_transfer',
      status: 'aprobado',
      created_at: '2026-10-10T10:00:00Z',
      approved_at: '2026-10-10T12:00:00Z',
      payment_proof_path: 't1/e.jpg',
      payment_proof_uploaded_at: '2026-10-10T11:00:00Z',
      payment_proof_exported_at: null,
      payment_proof_purged_at: null,
      buyer_name: 'Marcos Gómez',
    }
    const client = fakeClient({
      orders: [order('aaaaaaaa11', 'o1/a.png')],
      ticketOrders: [ticket],
      files: { 'o1/a.png': Buffer.from('atleta'), 't1/e.jpg': Buffer.from('entrada') },
    })
    const result = await exportProofs(client, { scope: 'pending' })

    expect(result.count).toBe(2)
    const zip = readZip(result.zip)
    expect(zip.map((e) => e.name)).toEqual([
      expect.stringMatching(/^comprobantes\/atletas\//),
      expect.stringMatching(/^comprobantes\/entradas\/2026-10-10_marcos-gomez_/),
      'indice.csv',
    ])
    const rows = zip[2].data.toString('utf8').split('\r\n')
    expect(rows.some((row) => row.startsWith('Entrada;TORD-tttttttt44'))).toBe(true)
    // Una actualización por tabla, cada una con sus propios ids.
    expect(client.updates.map((u) => u.ids)).toEqual([['aaaaaaaa11'], ['tttttttt44']])
  })

  it('con `all` devuelve el cursor para seguir cuando la tanda se llena, y nada en la última', async () => {
    const many = Array.from({ length: 101 }, (_, i) => ({
      ...order(`id${String(i).padStart(8, '0')}`, `o/${i}.png`),
      created_at: `2026-10-09T10:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z`,
    }))
    const files = Object.fromEntries(many.map((_, i) => [`o/${i}.png`, Buffer.from('x')]))

    const first = await exportProofs(fakeClient({ orders: many, files }), { scope: 'all' })
    expect(first.count).toBe(100)
    // El cursor es la fecha del último procesado: la tanda siguiente arranca después.
    expect(first.next).toBe(many[99].created_at)

    const last = await exportProofs(fakeClient({ orders: many.slice(100), files }), {
      scope: 'all',
      after: first.next,
    })
    expect(last.count).toBe(1)
    expect(last.next).toBeNull()
  })

  it('un archivo ilegible no frena el cursor: se cuenta como procesado', async () => {
    const many = Array.from({ length: 101 }, (_, i) => ({
      ...order(`id${String(i).padStart(8, '0')}`, `o/${i}.png`),
      created_at: `2026-10-09T10:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z`,
    }))
    // Ninguno existe en Storage: igual el cursor avanza, así que no se queda en loop.
    const result = await exportProofs(fakeClient({ orders: many, files: {} }), { scope: 'all' })
    expect(result.count).toBe(0)
    expect(result.failed).toBe(100)
    expect(result.next).toBe(many[99].created_at)
  })

  it('con nada que descargar no marca ninguna orden', async () => {
    const client = fakeClient({ orders: [order('cccccccc33', 'o3/c.png')], files: {} })
    const result = await exportProofs(client, { scope: 'pending' })
    expect(result.count).toBe(0)
    expect(client.updates).toHaveLength(0)
  })
})
