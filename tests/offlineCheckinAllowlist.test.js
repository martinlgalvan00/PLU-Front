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
})
