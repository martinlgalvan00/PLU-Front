import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCoalescer } from '../src/hooks/useBroadcastTopic.js'

/**
 * Los avisos de Realtime llegan en ráfaga (en plena entrada, uno por ingreso en
 * cada puerta). El agrupador tiene que convertir la ráfaga en una relectura,
 * pero sin dejar la pantalla congelada si los avisos no paran nunca.
 */
describe('createCoalescer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('una ráfaga dentro de la ventana es una sola llamada', () => {
    const fn = vi.fn()
    const coalescer = createCoalescer(fn, { debounceMs: 400, maxWaitMs: 2000 })

    for (let index = 0; index < 10; index += 1) {
      coalescer.trigger()
      vi.advanceTimersByTime(100)
    }
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(400)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('con avisos que no paran, igual relee como mucho cada maxWait', () => {
    const fn = vi.fn()
    const coalescer = createCoalescer(fn, { debounceMs: 400, maxWaitMs: 1000 })

    for (let index = 0; index < 30; index += 1) {
      coalescer.trigger()
      vi.advanceTimersByTime(200)
    }
    // 6 s de avisos cada 200 ms: sin el tope no habría ninguna relectura.
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(5)
  })

  it('cancelar descarta lo pendiente (al desmontar no se relee de más)', () => {
    const fn = vi.fn()
    const coalescer = createCoalescer(fn, { debounceMs: 400 })
    coalescer.trigger()
    coalescer.cancel()
    vi.advanceTimersByTime(5000)
    expect(fn).not.toHaveBeenCalled()
  })
})
