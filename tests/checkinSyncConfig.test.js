import { describe, expect, it } from 'vitest'
import { CHECKIN_SYNC, isSnapshotFresh, nextRetryDelayMs } from '../src/lib/checkinSyncConfig.js'

describe('checkinSyncConfig', () => {
  it('el primer fallo espera la base y el jitter no pasa del tope', () => {
    expect(nextRetryDelayMs(1, () => 0)).toBe(CHECKIN_SYNC.baseDelayMs)
    expect(nextRetryDelayMs(1, () => 1)).toBe(
      Math.round(CHECKIN_SYNC.baseDelayMs * (1 + CHECKIN_SYNC.jitterRatio)),
    )
    expect(nextRetryDelayMs(20, () => 0)).toBe(CHECKIN_SYNC.maxDelayMs)
  })

  it('una foto dentro del TTL se considera fresca', () => {
    const now = Date.parse('2026-10-29T15:00:00.000Z')
    const fresh = new Date(now - CHECKIN_SYNC.snapshotTtlMs + 1_000).toISOString()
    const stale = new Date(now - CHECKIN_SYNC.snapshotTtlMs - 1_000).toISOString()
    expect(isSnapshotFresh(fresh, now)).toBe(true)
    expect(isSnapshotFresh(stale, now)).toBe(false)
    expect(isSnapshotFresh(null, now)).toBe(false)
  })

  it('el escaneo no espera el timeout largo de la API', () => {
    expect(CHECKIN_SYNC.scanBudgetMs).toBeLessThan(2_000)
  })
})
