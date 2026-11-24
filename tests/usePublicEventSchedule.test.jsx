import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * La grilla pública se mantiene al día sola: se pide al montar, al volver a la
 * pestaña y cada minuto con la pestaña a la vista. Lo que no puede pasar es que
 * un pedido fallido esconda una grilla que ya se estaba mostrando.
 */

vi.mock('../src/services/eventRegistrationApi.js', () => ({
  fetchPublicEventSchedule: vi.fn(),
}))

const { fetchPublicEventSchedule } = await import('../src/services/eventRegistrationApi.js')
const { PUBLIC_SCHEDULE_REFRESH_MS, usePublicEventSchedule } =
  await import('../src/hooks/usePublicEventSchedule.js')

const schedule = (name) => ({
  enabled: true,
  platforms: [],
  days: [{ dayIndex: 0, label: name, lanes: [], sessionCount: 1 }],
  hasContent: true,
})

function setVisibility(value) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value })
}

beforeEach(() => {
  vi.useFakeTimers()
  setVisibility('visible')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.resetAllMocks()
  setVisibility('visible')
})

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('usePublicEventSchedule', () => {
  it('pide la grilla al montar y la deja lista', async () => {
    fetchPublicEventSchedule.mockResolvedValue(schedule('Día 1'))
    const { result } = renderHook(() => usePublicEventSchedule('pitbull'))
    await flush()

    expect(fetchPublicEventSchedule).toHaveBeenCalledWith('pitbull')
    expect(result.current.status).toBe('ready')
    expect(result.current.schedule.days[0].label).toBe('Día 1')
    expect(result.current.updatedAt).toEqual(expect.any(Number))
  })

  it('vuelve a pedirla cada minuto y refleja lo que cambió', async () => {
    fetchPublicEventSchedule.mockResolvedValueOnce(schedule('Día 1'))
    const { result } = renderHook(() => usePublicEventSchedule('pitbull'))
    await flush()

    fetchPublicEventSchedule.mockResolvedValueOnce(schedule('Día 1 (con cambios)'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUBLIC_SCHEDULE_REFRESH_MS)
    })

    expect(fetchPublicEventSchedule).toHaveBeenCalledTimes(2)
    expect(result.current.schedule.days[0].label).toBe('Día 1 (con cambios)')
  })

  it('si la respuesta no cambió conserva el mismo objeto, pero confirma la hora', async () => {
    fetchPublicEventSchedule.mockImplementation(async () => schedule('Día 1'))
    const { result } = renderHook(() => usePublicEventSchedule('pitbull'))
    await flush()
    const first = result.current.schedule
    const firstStamp = result.current.updatedAt

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUBLIC_SCHEDULE_REFRESH_MS)
    })

    // Mismo objeto: nada se vuelve a dibujar ni a animar.
    expect(result.current.schedule).toBe(first)
    expect(result.current.updatedAt).toBeGreaterThan(firstStamp)
  })

  it('no pide nada mientras la pestaña está oculta', async () => {
    fetchPublicEventSchedule.mockResolvedValue(schedule('Día 1'))
    renderHook(() => usePublicEventSchedule('pitbull'))
    await flush()

    setVisibility('hidden')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUBLIC_SCHEDULE_REFRESH_MS * 3)
    })
    expect(fetchPublicEventSchedule).toHaveBeenCalledTimes(1)
  })

  it('un pedido fallido NO esconde la grilla que ya se mostraba', async () => {
    fetchPublicEventSchedule.mockResolvedValueOnce(schedule('Día 1'))
    const { result } = renderHook(() => usePublicEventSchedule('pitbull'))
    await flush()

    fetchPublicEventSchedule.mockRejectedValueOnce(new Error('sin red'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUBLIC_SCHEDULE_REFRESH_MS)
    })

    expect(result.current.status).toBe('ready')
    expect(result.current.schedule.hasContent).toBe(true)
  })

  it('si falla el primer pedido la sección no se muestra', async () => {
    fetchPublicEventSchedule.mockRejectedValue(new Error('sin red'))
    const { result } = renderHook(() => usePublicEventSchedule('pitbull'))
    await flush()

    expect(result.current.status).toBe('error')
    expect(result.current.schedule.hasContent).toBe(false)
  })

  it('al desmontar deja de pedir', async () => {
    fetchPublicEventSchedule.mockResolvedValue(schedule('Día 1'))
    const { unmount } = renderHook(() => usePublicEventSchedule('pitbull'))
    await flush()
    unmount()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUBLIC_SCHEDULE_REFRESH_MS * 2)
    })
    expect(fetchPublicEventSchedule).toHaveBeenCalledTimes(1)
  })

  it('apagado o sin evento no pide nada', async () => {
    renderHook(() => usePublicEventSchedule('pitbull', { enabled: false }))
    renderHook(() => usePublicEventSchedule(''))
    await flush()
    expect(fetchPublicEventSchedule).not.toHaveBeenCalled()
  })
})
