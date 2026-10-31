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

const PERSON = '6a1f8c2e-7b3d-4e5f-9a0b-1c2d3e4f5a6b'

beforeEach(() => memory.clear())

describe('allowlist offline de inscripciones', () => {
  it('reconoce el QR del perfil (credentialToken) además de la credencial impresa', async () => {
    await db.downloadAllowlist('pitbull', {
      registrations: [
        {
          registrationId: 'r1',
          credentialToken: PERSON,
          qrToken: 'm-viejo',
          memberCode: 'PLU-0001',
        },
      ],
    })

    expect((await db.findInAllowlist('pitbull', PERSON))?.entry.registrationId).toBe('r1')
    expect((await db.findInAllowlist('pitbull', 'm-viejo'))?.entry.registrationId).toBe('r1')
    expect((await db.findInAllowlist('pitbull', 'plu-0001'))?.entry.registrationId).toBe('r1')
  })

  it('un ingreso sin conexión marca solo esa inscripción, aunque varias no tengan membresía', async () => {
    await db.downloadAllowlist('pitbull', {
      registrations: [
        { registrationId: 'r1', credentialToken: 'a', qrToken: null },
        { registrationId: 'r2', credentialToken: 'b', qrToken: null },
      ],
    })

    await db.enqueueCheckin({ eventSlug: 'pitbull', kind: 'registration', registrationId: 'r1' })

    const { registrations } = await db.getAllowlist('pitbull')
    expect(registrations.find((item) => item.registrationId === 'r1').checkedInLocally).toBe(true)
    expect(registrations.find((item) => item.registrationId === 'r2').checkedInLocally).toBe(false)
  })

  it('encuentra una entrada por código sin recorrer a mano y no encola dos veces el mismo QR', async () => {
    await db.downloadAllowlist('pitbull', {
      tickets: [
        { qrToken: 'qr-1', ticketCode: 'TCK-1', attendeeName: 'Ana' },
        { qrToken: 'qr-2', ticketCode: 'TCK-2', attendeeName: 'Luis' },
      ],
    })

    expect((await db.findInAllowlist('pitbull', 'tck-2'))?.entry.attendeeName).toBe('Luis')

    const first = await db.enqueueCheckin({
      eventSlug: 'pitbull',
      kind: 'ticket',
      qrToken: 'qr-1',
    })
    const second = await db.enqueueCheckin({
      eventSlug: 'pitbull',
      kind: 'ticket',
      qrToken: 'qr-1',
    })

    expect(second.localId).toBe(first.localId)
    expect(await db.listPending()).toHaveLength(1)
    expect((await db.findInAllowlist('pitbull', 'qr-1'))?.entry.checkedInLocally).toBe(true)
  })

  it('el código dictado encuentra la misma entrada que el QR', async () => {
    await db.downloadAllowlist('pitbull-puerta', {
      tickets: [{ qrToken: 'qr-1', ticketCode: 'TCK-1', gateCode: 'K4M-7QP', attendeeName: 'Ana' }],
    })

    const byQr = await db.findInAllowlist('pitbull-puerta', 'qr-1')
    const bySpoken = await db.findInAllowlist('pitbull-puerta', 'k4m 7qp')
    const byCompact = await db.findInAllowlist('pitbull-puerta', 'k4m7qp')

    expect(bySpoken?.entry.qrToken).toBe(byQr?.entry.qrToken)
    expect(byCompact?.entry.attendeeName).toBe('Ana')
  })

  it('anota el QR en la bitácora y, al enviarlo, queda como registrado', async () => {
    const entry = await db.enqueueCheckin({
      eventSlug: 'pitbull',
      kind: 'ticket',
      qrToken: 'qr-1',
      label: 'TCK-1',
    })

    expect(await db.listDoorSyncStatus()).toEqual([
      expect.objectContaining({ localId: entry.localId, label: 'TCK-1', status: 'pending' }),
    ])

    await db.removePending(entry.localId)
    await db.noteSyncJournal({ ...entry, status: 'synced' })

    expect(await db.listDoorSyncStatus()).toEqual([
      expect.objectContaining({ localId: entry.localId, label: 'TCK-1', status: 'synced' }),
    ])
  })

  it('marcar un ingreso no reescribe la lista entera', async () => {
    await db.downloadAllowlist('pitbull', {
      tickets: [{ qrToken: 'qr-1', ticketCode: 'TCK-1', attendeeName: 'Ana' }],
    })
    const stored = memory.get('allowlist:pitbull')

    await db.markCheckedInLocally('pitbull', { qrToken: 'qr-1' })

    expect(memory.get('allowlist:pitbull')).toBe(stored)
    expect(memory.get('local-admits:pitbull').tickets).toEqual(['qr-1'])
    expect((await db.findInAllowlist('pitbull', 'qr-1'))?.entry.checkedInLocally).toBe(true)
  })
})
