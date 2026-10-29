import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/lib/api.js'
import { CHECKIN_SYNC } from '../src/lib/checkinSyncConfig.js'

const pending = []
const conflicts = []
const { noteSyncJournal } = vi.hoisted(() => ({ noteSyncJournal: vi.fn() }))

vi.mock('../src/lib/offlineCheckinDb.js', () => ({
  addResolvedConflict: vi.fn(async (entry) => {
    conflicts.push(entry)
  }),
  noteSyncJournal,
  downloadAllowlist: vi.fn(),
  listPending: vi.fn(async () => [...pending]),
  removePending: vi.fn(async (localId) => {
    const index = pending.findIndex((item) => item.localId === localId)
    if (index >= 0) pending.splice(index, 1)
  }),
  updatePending: vi.fn(async (localId, patch) => {
    const item = pending.find((entry) => entry.localId === localId)
    if (item) Object.assign(item, patch)
  }),
}))

const checkInTicket = vi.fn()
const checkInRegistration = vi.fn()
vi.mock('../src/services/ticketApi.js', () => ({
  checkInTicket: (...args) => checkInTicket(...args),
}))
vi.mock('../src/services/athleteApi.js', () => ({
  checkInRegistration: (...args) => checkInRegistration(...args),
  getEventCheckinAllowlist: vi.fn(),
}))

const { syncPendingCheckins } = await import('../src/services/offlineCheckinSync.js')

const ticketEntry = (localId, qrToken = `qr-${localId}`) => ({
  localId,
  kind: 'ticket',
  qrToken,
  gate: 'Puerta 1',
})
const apiError = (status, body = {}) => new ApiError('x', { status, body })

beforeEach(() => {
  pending.length = 0
  conflicts.length = 0
  checkInTicket.mockReset()
  checkInRegistration.mockReset()
  noteSyncJournal.mockClear()
})

describe('syncPendingCheckins', () => {
  it('sincroniza en orden FIFO y vacía la cola', async () => {
    pending.push(ticketEntry('a'), ticketEntry('b'))
    checkInTicket.mockResolvedValue({})

    const results = await syncPendingCheckins()

    expect(results.map((item) => item.outcome)).toEqual(['ok', 'ok'])
    expect(checkInTicket.mock.calls.map((call) => call[0])).toEqual(['qr-a', 'qr-b'])
    expect(pending).toHaveLength(0)
    expect(noteSyncJournal).toHaveBeenCalledWith(expect.objectContaining({ localId: 'a', status: 'synced' }))
    expect(noteSyncJournal).toHaveBeenCalledWith(expect.objectContaining({ localId: 'b', status: 'synced' }))
  })

  it('PLU06 es un conflicto de carrera entre dispositivos', async () => {
    pending.push(ticketEntry('a'))
    checkInTicket.mockRejectedValue(apiError(409, { code: 'PLU06' }))

    const [result] = await syncPendingCheckins()

    expect(result.outcome).toBe('conflict')
    expect(pending).toHaveLength(0)
    expect(conflicts[0]).toMatchObject({ localId: 'a', reason: 'PLU06' })
  })

  it('un 409 por vencido o zona incorrecta NO se rotula como carrera, y queda con su motivo', async () => {
    pending.push(ticketEntry('a'), ticketEntry('b'))
    checkInTicket
      .mockRejectedValueOnce(apiError(409, { code: 'PLU15' }))
      .mockRejectedValueOnce(apiError(409, { code: 'PLU16' }))

    const results = await syncPendingCheckins()

    expect(results.map((item) => item.outcome)).toEqual(['rejected', 'rejected'])
    expect(conflicts.map((item) => item.reason)).toEqual(['PLU15', 'PLU16'])
  })

  it('con la sesión vencida corta el drenaje y deja todo en la cola', async () => {
    pending.push(ticketEntry('a'), ticketEntry('b'), ticketEntry('c'))
    checkInTicket.mockRejectedValue(apiError(401))

    const results = await syncPendingCheckins({ concurrency: 1 })

    expect(results).toHaveLength(1)
    expect(results[0].outcome).toBe('auth')
    expect(checkInTicket).toHaveBeenCalledTimes(1)
    expect(pending).toHaveLength(3)
  })

  it('una caída de red (status 0) deja la entrada en la cola para reintentar', async () => {
    pending.push(ticketEntry('a'))
    checkInTicket.mockRejectedValue(apiError(0))

    const [result] = await syncPendingCheckins()

    expect(result.outcome).toBe('retry')
    expect(pending).toHaveLength(1)
  })

  it('5xx y 429 también se reintentan', async () => {
    pending.push(ticketEntry('a'), ticketEntry('b'))
    checkInTicket.mockRejectedValueOnce(apiError(503)).mockRejectedValueOnce(apiError(429))

    const results = await syncPendingCheckins()

    expect(results.map((item) => item.outcome)).toEqual(['retry', 'retry'])
    expect(pending).toHaveLength(2)
  })

  it('un 404 descarta la entrada: ese QR ya no existe', async () => {
    pending.push(ticketEntry('a'))
    checkInTicket.mockRejectedValue(apiError(404))

    const [result] = await syncPendingCheckins()

    expect(result.outcome).toBe('not_found')
    expect(pending).toHaveLength(0)
  })

  it('las inscripciones de atletas viajan por su propio endpoint', async () => {
    pending.push({ localId: 'r', kind: 'registration', registrationId: 'reg-1', gate: 'Pesaje' })
    checkInRegistration.mockResolvedValue({})

    const [result] = await syncPendingCheckins()

    expect(result.outcome).toBe('ok')
    expect(checkInRegistration).toHaveBeenCalledWith('reg-1', 'Pesaje')
  })

  it('no manda dos veces el mismo QR en el mismo drenaje', async () => {
    pending.push(ticketEntry('a', 'same'), ticketEntry('b', 'same'))
    checkInTicket.mockResolvedValue({})

    const results = await syncPendingCheckins()

    expect(checkInTicket).toHaveBeenCalledTimes(1)
    expect(results).toHaveLength(1)
    expect(results[0].outcome).toBe('ok')
    expect(pending.map((item) => item.localId)).toEqual(['b'])
  })

  it('no reintenta antes de nextAttemptAt', async () => {
    const now = Date.parse('2026-10-29T12:00:00.000Z')
    pending.push({
      ...ticketEntry('a'),
      attemptCount: 1,
      nextAttemptAt: new Date(now + 60_000).toISOString(),
    })

    const results = await syncPendingCheckins({ now })

    expect(results).toEqual([])
    expect(checkInTicket).not.toHaveBeenCalled()
    expect(pending).toHaveLength(1)
  })

  it('al agotar intentos deja el ingreso en la cola, no lo borra', async () => {
    pending.push({ ...ticketEntry('a'), attemptCount: CHECKIN_SYNC.maxAttempts - 1 })
    checkInTicket.mockRejectedValue(apiError(0))

    const [result] = await syncPendingCheckins({ now: 1_000 })

    expect(result.outcome).toBe('exhausted')
    expect(pending).toHaveLength(1)
    expect(pending[0].status).toBe('exhausted')
    expect(checkInTicket).toHaveBeenCalledTimes(1)
  })
})
