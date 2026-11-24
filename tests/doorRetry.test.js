import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/lib/api.js'
import { CHECKIN_SYNC } from '../src/lib/checkinSyncConfig.js'
import { runDoorAttempts } from '../src/services/doorRetry.js'

const network = () => new ApiError('sin red', { status: 0 })
const rejected = () => new ApiError('vencido', { status: 409, body: { code: 'PLU15' } })

describe('runDoorAttempts', () => {
  it('reintenta una caída de red tres veces y después la deja pasar', async () => {
    const task = vi.fn(async () => {
      throw network()
    })

    await expect(runDoorAttempts(task, { sleep: async () => {} })).rejects.toMatchObject({ status: 0 })
    expect(task).toHaveBeenCalledTimes(CHECKIN_SYNC.maxAttempts)
    expect(CHECKIN_SYNC.maxAttempts).toBe(3)
  })

  it('no reintenta un veredicto del servidor', async () => {
    const task = vi.fn(async () => {
      throw rejected()
    })

    await expect(runDoorAttempts(task, { sleep: async () => {} })).rejects.toMatchObject({ status: 409 })
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('devuelve el resultado si un intento posterior sale bien', async () => {
    const task = vi
      .fn()
      .mockRejectedValueOnce(network())
      .mockResolvedValueOnce({ outcome: 'ok' })

    await expect(runDoorAttempts(task, { sleep: async () => {} })).resolves.toEqual({ outcome: 'ok' })
    expect(task).toHaveBeenCalledTimes(2)
  })
})
