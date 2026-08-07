import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/lib/api.js'
import { throwAsApiError } from '../src/lib/rpcErrors.js'
import {
  FAILURE,
  TimeoutError,
  classifyFailure,
  isRetryable,
  withRetry,
  withTimeout,
} from '../src/lib/resilience.js'
import { formatCacheAge } from '../src/services/credentialCache.js'

/**
 * Tolerancia a fallos de la verificación en la puerta.
 *
 * La regla que fijan estos tests: **"no pude preguntar" nunca puede
 * convertirse en "no existe"**. Un falso negativo en la puerta rebota a un
 * atleta que pagó, y desde la pantalla se ve igual que un rechazo legítimo.
 */

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('clasificación de fallos', () => {
  it('un error de transporte no se confunde con "no encontrado"', () => {
    expect(classifyFailure(new ApiError('sin red', { status: 0 }))).toBe(FAILURE.unreachable)
    expect(classifyFailure(new ApiError('no existe', { status: 404 }))).toBe(FAILURE.notFound)
  })

  it('trata 5xx, timeout y rate limit como alcanzables más tarde', () => {
    for (const status of [500, 502, 503, 408, 429]) {
      expect(classifyFailure(new ApiError('x', { status }))).toBe(FAILURE.unreachable)
    }
  })

  it('separa permiso denegado y regla de negocio', () => {
    expect(classifyFailure(new ApiError('x', { status: 403 }))).toBe(FAILURE.denied)
    expect(classifyFailure(new ApiError('ya usada', { status: 409 }))).toBe(FAILURE.rejected)
  })

  it('un TypeError de fetch suelto sigue siendo transporte', () => {
    // Si se escapa de la capa de API no puede degradar a "desconocido": eso lo
    // acercaría peligrosamente a "inválido".
    expect(classifyFailure(new TypeError('Failed to fetch'))).toBe(FAILURE.unreachable)
  })

  it('solo reintenta lo que puede cambiar solo', () => {
    expect(isRetryable(new ApiError('x', { status: 0 }))).toBe(true)
    expect(isRetryable(new ApiError('x', { status: 404 }))).toBe(false)
    expect(isRetryable(new ApiError('x', { status: 409 }))).toBe(false)
  })
})

describe('traducción de errores de supabase-js', () => {
  it('un fallo de red se marca como inalcanzable, no como error de cliente', () => {
    // Regresión: sin `code`, el mapeo caía en 400 y la página de verificación
    // lo leía como credencial inexistente.
    let caught
    try {
      throwAsApiError({ message: 'TypeError: Failed to fetch' })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(ApiError)
    expect(caught.status).toBe(0)
    expect(classifyFailure(caught)).toBe(FAILURE.unreachable)
  })

  it('PLU02 sigue siendo un 404 de dominio', () => {
    let caught
    try {
      throwAsApiError({ code: 'PLU02', message: 'Credencial no encontrada.' })
    } catch (error) {
      caught = error
    }
    expect(caught.status).toBe(404)
    expect(classifyFailure(caught)).toBe(FAILURE.notFound)
  })

  it('un error de dominio con código no se disfraza de problema de red', () => {
    let caught
    try {
      throwAsApiError({ code: '23505', message: 'duplicate key' })
    } catch (error) {
      caught = error
    }
    expect(caught.status).toBe(400)
  })
})

describe('reintentos', () => {
  it('reintenta un fallo de transporte y devuelve el resultado bueno', async () => {
    const task = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('sin red', { status: 0 }))
      .mockResolvedValueOnce({ ok: true })

    const result = await withRetry(task, { delays: [0] })

    expect(result).toEqual({ ok: true })
    expect(task).toHaveBeenCalledTimes(2)
  })

  it('no reintenta un 404: la respuesta del backend es final', async () => {
    const task = vi.fn().mockRejectedValue(new ApiError('no existe', { status: 404 }))

    await expect(withRetry(task, { delays: [0, 0] })).rejects.toMatchObject({ status: 404 })
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('se rinde después de agotar los intentos y propaga el último error', async () => {
    const task = vi.fn().mockRejectedValue(new ApiError('sin red', { status: 0 }))

    await expect(withRetry(task, { delays: [0, 0] })).rejects.toMatchObject({ status: 0 })
    expect(task).toHaveBeenCalledTimes(3)
  })

  it('corta una promesa que nunca responde', async () => {
    // Sin timeout, en una red que acepta la conexión pero no contesta el
    // operador se queda mirando "Verificando…" sin saber si esperar.
    await expect(withTimeout(new Promise(() => {}), 10)).rejects.toBeInstanceOf(TimeoutError)
  })

  it('un timeout se reintenta como fallo de transporte', async () => {
    const task = vi
      .fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce({ ok: true })

    const result = await withRetry(task, { delays: [0], timeoutMs: 10 })

    expect(result).toEqual({ ok: true })
    expect(task).toHaveBeenCalledTimes(2)
  })
})

describe('antigüedad del dato cacheado', () => {
  it('se dice en la unidad que le sirve al operador', () => {
    expect(formatCacheAge(30_000)).toBe('hace segundos')
    expect(formatCacheAge(5 * 60_000)).toBe('hace 5 min')
    expect(formatCacheAge(3 * 3_600_000)).toBe('hace 3 h')
    expect(formatCacheAge(2 * 86_400_000)).toBe('hace 2 d')
  })
})
