import { describe, expect, it, vi } from 'vitest'
import {
  classifyProviderFailure,
  withTransientRetry,
} from '../server/modules/payments/providerRetry.js'

function httpFailure(status, extra = {}) {
  const error = new Error(`Mercado Pago respondio ${status}.`)
  error.status = status
  return Object.assign(error, extra)
}

describe('clasificacion de fallas del proveedor', () => {
  it('un 429 es transitorio y arrastra el Retry-After del proveedor', () => {
    const failure = classifyProviderFailure(
      httpFailure(429, { headers: { 'retry-after': '2' } }),
    )
    expect(failure).toMatchObject({ transient: true, reason: 'rate_limited', retryAfterMs: 2000 })
  })

  it('lee el Retry-After que getJson dejo en provider.retryAfterSeconds', () => {
    const error = new Error('Mercado Pago respondio 429.')
    error.provider = { apiResponseStatus: 429, retryAfterSeconds: 3 }
    expect(classifyProviderFailure(error)).toMatchObject({
      transient: true,
      reason: 'rate_limited',
      retryAfterMs: 3000,
      status: 429,
    })
  })

  it('acota el Retry-After al techo in-process: lo demas es de la cola durable', () => {
    const failure = classifyProviderFailure(
      httpFailure(429, { headers: { 'retry-after': '600' } }),
    )
    expect(failure.retryAfterMs).toBe(10_000)
  })

  it('un 5xx es transitorio; un 4xx de negocio no', () => {
    expect(classifyProviderFailure(httpFailure(500)).transient).toBe(true)
    expect(classifyProviderFailure(httpFailure(503)).transient).toBe(true)
    expect(classifyProviderFailure(httpFailure(400)).transient).toBe(false)
    expect(classifyProviderFailure(httpFailure(404)).transient).toBe(false)
  })

  it('reconoce el corte de red aunque venga envuelto en la cadena de causas', () => {
    const abort = new Error('This operation was aborted')
    abort.name = 'AbortError'
    const wrapped = new Error('Error de Mercado Pago.', { cause: abort })
    expect(classifyProviderFailure(wrapped)).toMatchObject({
      transient: true,
      reason: 'network',
    })

    const reset = new Error('request failed')
    reset.cause = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
    expect(classifyProviderFailure(reset).transient).toBe(true)
  })

  it('no confunde un rechazo comercial con una falla tecnica', () => {
    const rejected = new Error('cc_rejected_insufficient_amount')
    expect(classifyProviderFailure(rejected).transient).toBe(false)
  })
})

describe('reintento transitorio in-process', () => {
  it('una lectura reintenta un 500 puntual y devuelve el resultado real', async () => {
    const sleep = vi.fn(async () => {})
    const run = vi
      .fn()
      .mockRejectedValueOnce(httpFailure(500))
      .mockResolvedValueOnce({ id: 'payment-1', status: 'approved' })

    const result = await withTransientRetry(run, { idempotent: true, sleep, random: () => 0.5 })

    expect(result).toEqual({ id: 'payment-1', status: 'approved' })
    expect(run).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
    // Primer backoff ~500ms; con random()=0.5 el jitter es exactamente 0.
    expect(sleep).toHaveBeenCalledWith(500)
  })

  it('agota los reintentos y deja salir el ultimo error', async () => {
    const sleep = vi.fn(async () => {})
    const run = vi.fn().mockRejectedValue(httpFailure(502))

    await expect(
      withTransientRetry(run, { idempotent: true, sleep, random: () => 0.5 }),
    ).rejects.toMatchObject({ status: 502 })
    // 1 intento inmediato + 3 reintentos (500/1500/3500).
    expect(run).toHaveBeenCalledTimes(4)
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 1500, 3500])
  })

  it('el backoff lleva jitter: dos procesos no reintentan sincronizados', async () => {
    const sleep = vi.fn(async () => {})
    const run = vi.fn().mockRejectedValueOnce(httpFailure(500)).mockResolvedValueOnce('ok')

    await withTransientRetry(run, { idempotent: true, sleep, random: () => 1 })
    // random()=1 -> +20% sobre la base de 500ms.
    expect(sleep).toHaveBeenCalledWith(600)
  })

  it('una escritura NO reintenta un timeout: puede haber cobrado igual', async () => {
    const abort = new Error('This operation was aborted')
    abort.name = 'AbortError'
    const sleep = vi.fn(async () => {})
    const run = vi.fn().mockRejectedValue(abort)

    await expect(withTransientRetry(run, { sleep })).rejects.toBe(abort)
    expect(run).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('una escritura NO reintenta un 5xx: el resultado del cobro es desconocido', async () => {
    const sleep = vi.fn(async () => {})
    const run = vi.fn().mockRejectedValue(httpFailure(500))

    await expect(withTransientRetry(run, { sleep })).rejects.toMatchObject({ status: 500 })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('una escritura SI reintenta un 429 respetando el Retry-After', async () => {
    const sleep = vi.fn(async () => {})
    const run = vi
      .fn()
      .mockRejectedValueOnce(httpFailure(429, { headers: { 'retry-after': '2' } }))
      .mockResolvedValueOnce({ id: 'pref-1' })

    const result = await withTransientRetry(run, { sleep, random: () => 0 })

    expect(result).toEqual({ id: 'pref-1' })
    expect(run).toHaveBeenCalledTimes(2)
    // Espera lo que pidio el proveedor (2s) mas el colchon aleatorio (0 aca).
    expect(sleep).toHaveBeenCalledWith(2000)
  })

  it('un 4xx de negocio nunca se reintenta, ni siquiera en lecturas', async () => {
    const sleep = vi.fn(async () => {})
    const run = vi.fn().mockRejectedValue(httpFailure(400))

    await expect(withTransientRetry(run, { idempotent: true, sleep })).rejects.toMatchObject({
      status: 400,
    })
    expect(run).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })
})
