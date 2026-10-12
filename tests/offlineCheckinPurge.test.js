import { beforeEach, describe, expect, it, vi } from 'vitest'

const memory = new Map()
vi.mock('idb-keyval', () => ({
  createStore: () => 'store',
  get: async (key) => memory.get(key),
  set: async (key, value) => {
    memory.set(key, value)
  },
  del: async (key) => {
    memory.delete(key)
  },
  keys: async () => [...memory.keys()],
}))

const db = await import('../src/lib/offlineCheckinDb.js')

beforeEach(() => memory.clear())

describe('purgeOfflineCheckinData', () => {
  it('borra las listas descargadas (nombre y DNI) de todos los eventos y el log de conflictos', async () => {
    await db.downloadAllowlist('evento-a', {
      tickets: [{ qrToken: 'q1', attendeeName: 'Ana', attendeeDni: '30111222' }],
    })
    await db.downloadAllowlist('evento-b', { registrations: [{ qrToken: 'q2' }] })
    await db.addResolvedConflict({ localId: 'x', qrToken: 'q1' })

    await db.purgeOfflineCheckinData()

    expect(await db.getAllowlist('evento-a')).toBeNull()
    expect(await db.getAllowlist('evento-b')).toBeNull()
    expect(await db.listResolvedConflicts()).toEqual([])
  })

  it('no toca la cola de ingresos pendientes: perderla perdería ingresos sin sincronizar', async () => {
    await db.downloadAllowlist('evento-a', { tickets: [{ qrToken: 'q1' }] })
    await db.enqueueCheckin({ eventSlug: 'evento-a', kind: 'ticket', qrToken: 'q1', gate: 'P1' })

    await db.purgeOfflineCheckinData()

    const pending = await db.listPending()
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ qrToken: 'q1', gate: 'P1' })
  })

  it('la cola de telemetría tampoco se borra', async () => {
    await db.enqueueScanEvent({ clientId: 'c1', outcome: 'invalid' })
    await db.purgeOfflineCheckinData()
    expect(await db.listPendingScanEvents()).toHaveLength(1)
  })
})
