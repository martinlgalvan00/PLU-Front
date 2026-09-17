import { describe, expect, it, vi } from 'vitest'
import {
  buildScanEventRow,
  recordScanEvent,
  recordScanEvents,
} from '../server/modules/checkin/scanEventRecorder.js'

function fakeClient(result = { error: null }) {
  const upsert = vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue(result) })
  const from = vi.fn().mockReturnValue({ upsert })
  return { client: { from }, upsert, from }
}

describe('buildScanEventRow', () => {
  it('nunca guarda el token crudo del QR, sólo su fingerprint', () => {
    const row = buildScanEventRow({
      eventId: 'evt-1',
      outcome: 'expired',
      evidence: 'server',
      qrToken: 'super-secreto-token-de-qr',
    })
    expect(row.qr_fingerprint).not.toContain('super-secreto')
    expect(row).not.toHaveProperty('qr_token')
    expect(row.qr_fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  it('descarta un outcome, kind o evidence fuera del catálogo cerrado', () => {
    expect(buildScanEventRow({ eventId: 'evt-1', outcome: 'anything', evidence: 'server' })).toBeNull()
    expect(buildScanEventRow({ eventId: 'evt-1', outcome: 'ready', evidence: 'client' })).toBeNull()
    expect(buildScanEventRow({ eventId: null, outcome: 'ready', evidence: 'server' })).toBeNull()
  })

  it('un kind desconocido cae en "unknown" en vez de descartar la fila', () => {
    const row = buildScanEventRow({ eventId: 'evt-1', outcome: 'not_found', evidence: 'server', kind: 'bogus' })
    expect(row.kind).toBe('unknown')
  })

  it('acota un scanned_at en el futuro o muy en el pasado al reloj del servidor', () => {
    const now = Date.now()
    const farFuture = new Date(now + 60 * 60 * 1000).toISOString()
    const farPast = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()

    const future = buildScanEventRow({ eventId: 'evt-1', outcome: 'ready', evidence: 'operator', scannedAt: farFuture })
    const past = buildScanEventRow({ eventId: 'evt-1', outcome: 'ready', evidence: 'operator', scannedAt: farPast })

    expect(new Date(future.scanned_at).getTime()).toBeLessThanOrEqual(now + 1000)
    expect(new Date(past.scanned_at).getTime()).toBeGreaterThanOrEqual(now - 1000)
  })

  it('mantiene un scanned_at razonable tal cual', () => {
    const reasonable = new Date(Date.now() - 60 * 1000).toISOString()
    const row = buildScanEventRow({ eventId: 'evt-1', outcome: 'ready', evidence: 'operator', scannedAt: reasonable })
    expect(row.scanned_at).toBe(new Date(reasonable).toISOString())
  })

  it('guarda el snapshot temporal sin aceptar datos ajenos al contrato', () => {
    const row = buildScanEventRow({
      eventId: 'evt-1',
      outcome: 'expired',
      evidence: 'server',
      metadata: {
        validity: {
          status: 'expired',
          validFrom: '2026-08-15T10:00:00.000Z',
          validUntil: '2026-08-15T12:00:00.000Z',
          expiredForSeconds: 60,
          attendeeDni: '30111222',
        },
      },
    })

    expect(row.metadata).toEqual({
      validity: {
        status: 'expired',
        validFrom: '2026-08-15T10:00:00.000Z',
        validUntil: '2026-08-15T12:00:00.000Z',
        remainingSeconds: null,
        expiredForSeconds: 60,
      },
    })
    expect(JSON.stringify(row.metadata)).not.toContain('30111222')
  })
})

describe('recordScanEvents', () => {
  it('nunca lanza, aunque el insert falle', async () => {
    const { client } = fakeClient({ error: new Error('boom') })
    await expect(
      recordScanEvents(client, [{ eventId: 'evt-1', outcome: 'ready', evidence: 'server' }]),
    ).resolves.toBe(false)
  })

  it('filtra filas inválidas antes de escribir y no llama al cliente si no queda ninguna', async () => {
    const { client, from } = fakeClient()
    const ok = await recordScanEvents(client, [{ eventId: null, outcome: 'ready', evidence: 'server' }])
    expect(ok).toBe(false)
    expect(from).not.toHaveBeenCalled()
  })

  it('hace upsert con ignoreDuplicates sobre device_id+client_id para no duplicar reintentos', async () => {
    const { client, from, upsert } = fakeClient()
    await recordScanEvent(client, { eventId: 'evt-1', outcome: 'checked_in', evidence: 'server' })
    expect(from).toHaveBeenCalledWith('checkin_scan_events')
    expect(upsert).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ onConflict: 'device_id,client_id', ignoreDuplicates: true }),
    )
  })
})
