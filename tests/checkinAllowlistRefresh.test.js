import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/lib/api.js'

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

const getEventCheckinAllowlist = vi.fn()
vi.mock('../src/services/athleteApi.js', () => ({
  checkInRegistration: vi.fn(),
  getEventCheckinAllowlist: (...args) => getEventCheckinAllowlist(...args),
}))
vi.mock('../src/services/ticketApi.js', () => ({
  checkInTicket: vi.fn(),
}))

const db = await import('../src/lib/offlineCheckinDb.js')
const { downloadAllowlist } = await import('../src/services/offlineCheckinSync.js')

beforeEach(() => {
  memory.clear()
  getEventCheckinAllowlist.mockReset()
})

describe('refresco de la lista de puerta', () => {
  it('si el servidor dice que no cambió, no reescribe las entradas', async () => {
    await db.downloadAllowlist(
      'pitbull',
      { tickets: [{ qrToken: 'qr-1', attendeeName: 'Ana', status: 'pagada' }] },
      { etag: 'W/"abc"' },
    )
    await db.enqueueCheckin({ eventSlug: 'pitbull', kind: 'ticket', qrToken: 'qr-1' })
    const storedBefore = memory.get('allowlist:pitbull')

    getEventCheckinAllowlist.mockResolvedValue({
      notModified: true,
      etag: 'W/"abc"',
      data: null,
    })
    const refreshed = await downloadAllowlist('pitbull')

    expect(memory.get('allowlist:pitbull')).toBe(storedBefore)
    expect(refreshed.downloadedAt).not.toBe(storedBefore.downloadedAt)
    expect(refreshed.tickets[0].checkedInLocally).toBe(true)
    expect(getEventCheckinAllowlist).toHaveBeenCalledWith('pitbull', { etag: 'W/"abc"' })
  })

  it('una lista nueva conserva el ingreso local que el servidor todavía no tiene', async () => {
    await db.downloadAllowlist('pitbull', {
      tickets: [{ qrToken: 'qr-1', status: 'pagada', attendeeName: 'Ana' }],
    })
    await db.enqueueCheckin({ eventSlug: 'pitbull', kind: 'ticket', qrToken: 'qr-1' })

    getEventCheckinAllowlist.mockResolvedValue({
      notModified: false,
      etag: 'W/"next"',
      data: {
        tickets: [{ qrToken: 'qr-1', status: 'pagada', attendeeName: 'Ana' }],
        registrations: [],
      },
    })

    const refreshed = await downloadAllowlist('pitbull')
    expect(refreshed.tickets[0].checkedInLocally).toBe(true)
    expect(refreshed.etag).toBe('W/"next"')
  })

  it('si el servidor ya registró el ingreso, suelta la marca local', async () => {
    await db.downloadAllowlist('pitbull', {
      tickets: [{ qrToken: 'qr-1', status: 'pagada' }],
    })
    await db.enqueueCheckin({ eventSlug: 'pitbull', kind: 'ticket', qrToken: 'qr-1' })

    getEventCheckinAllowlist.mockResolvedValue({
      notModified: false,
      etag: 'W/"used"',
      data: {
        tickets: [
          { qrToken: 'qr-1', status: 'pagada', checkedInAt: '2026-10-29T15:00:00.000Z' },
        ],
      },
    })

    const refreshed = await downloadAllowlist('pitbull')
    expect(refreshed.tickets[0].checkedInLocally).toBe(false)
    expect(refreshed.tickets[0].checkedInAt).toBe('2026-10-29T15:00:00.000Z')
  })

  it('dos pedidos juntos bajan la lista una sola vez', async () => {
    let release = () => {}
    const gate = new Promise((resolve) => {
      release = resolve
    })
    getEventCheckinAllowlist.mockImplementation(() =>
      gate.then(() => ({
        notModified: false,
        etag: 'W/"once"',
        data: { tickets: [{ qrToken: 'qr-once', status: 'pagada' }] },
      })),
    )

    const first = downloadAllowlist('pitbull-once')
    const second = downloadAllowlist('pitbull-once')
    release()
    const [left, right] = await Promise.all([first, second])

    expect(left).toBe(right)
    expect(getEventCheckinAllowlist).toHaveBeenCalledTimes(1)
  })

  it('reintenta tres veces la descarga y conserva la foto anterior si no hay respuesta', async () => {
    await db.downloadAllowlist('pitbull', {
      tickets: [{ qrToken: 'qr-1', status: 'pagada', attendeeName: 'Ana' }],
    })
    const storedBefore = memory.get('allowlist:pitbull')
    getEventCheckinAllowlist.mockRejectedValue(new ApiError('sin red', { status: 0 }))

    await expect(downloadAllowlist('pitbull')).rejects.toMatchObject({ status: 0 })

    expect(getEventCheckinAllowlist).toHaveBeenCalledTimes(3)
    expect(memory.get('allowlist:pitbull')).toBe(storedBefore)
  })
})
