import { ApiError } from './api.js'

/**
 * resilience.js — PLU ARG
 *
 * Política común de tolerancia a fallos para las lecturas críticas de la
 * puerta del evento: clasificación del fallo, timeout y reintento con backoff.
 *
 * La regla que ordena todo el archivo: **nunca convertir "no pude preguntar"
 * en "no existe"**. En un gimnasio con wifi saturado y 4G intermitente, un
 * error de red es más probable que una credencial falsa; si la pantalla los
 * confunde, el operador rebota gente que pagó. Por eso `classifyFailure`
 * separa las dos cosas y el resto del sistema decide en base a eso.
 */

/**
 * `unreachable` — no hubo respuesta del backend. Reintentable, y jamás debe
 *   presentarse como credencial inválida.
 * `not_found`   — el backend respondió y dijo que ese código no existe.
 * `denied`      — el backend respondió y negó el permiso.
 * `rejected`    — regla de negocio (ya usada, no paga). Respuesta legítima.
 * `unknown`     — respondió con algo que no sabemos interpretar.
 */
export const FAILURE = {
  unreachable: 'unreachable',
  notFound: 'not_found',
  denied: 'denied',
  rejected: 'rejected',
  unknown: 'unknown',
}

export function classifyFailure(error) {
  if (!(error instanceof ApiError)) {
    // Un TypeError de fetch que se escapó de la capa de API sigue siendo un
    // problema de transporte: tratarlo como "desconocido" lo acercaría
    // peligrosamente a "inválido".
    const message = String(error?.message ?? '').toLowerCase()
    if (message.includes('fetch') || message.includes('network') || message.includes('abort')) {
      return FAILURE.unreachable
    }
    return FAILURE.unknown
  }

  const { status } = error
  if (status === 0 || status === 408 || status === 429 || status >= 500) {
    return FAILURE.unreachable
  }
  if (status === 404) return FAILURE.notFound
  if (status === 401 || status === 403) return FAILURE.denied
  if (status === 409) return FAILURE.rejected
  return FAILURE.unknown
}

/** Solo se reintenta lo que puede cambiar de resultado sin intervención. */
export function isRetryable(error) {
  return classifyFailure(error) === FAILURE.unreachable
}

/** ¿El navegador se declara sin conexión? `false` no garantiza que haya. */
export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export class TimeoutError extends Error {
  constructor(ms) {
    super(`La operación superó ${ms}ms.`)
    this.name = 'TimeoutError'
  }
}

/**
 * Corta una promesa que no responde. Sin esto, en una red que acepta la
 * conexión pero no contesta, el operador se queda mirando "Verificando…" sin
 * saber si esperar o pasar a la planilla.
 */
export function withTimeout(promise, ms) {
  if (!ms) return promise

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

const DEFAULT_DELAYS = [400, 1200]

/**
 * Ejecuta `task` reintentando solo los fallos de transporte.
 *
 * Los backoffs son cortos y pocos a propósito: esto corre con una persona
 * esperando en la puerta. Es preferible rendirse en ~2s y ofrecer un estado
 * accionable que insistir treinta segundos contra una red caída.
 *
 * @param {(attempt: number) => Promise<T>} task
 * @param {{ delays?: number[], timeoutMs?: number, signal?: AbortSignal,
 *           onRetry?: (info: { attempt: number, error: unknown }) => void }} options
 * @returns {Promise<T>}
 * @template T
 */
export async function withRetry(task, options = {}) {
  const { delays = DEFAULT_DELAYS, timeoutMs = 8000, signal, onRetry } = options
  const total = delays.length + 1
  let lastError

  for (let attempt = 0; attempt < total; attempt += 1) {
    if (signal?.aborted) throw lastError ?? new Error('Cancelado.')

    try {
      return await withTimeout(Promise.resolve(task(attempt)), timeoutMs)
    } catch (error) {
      lastError = error

      const retryable = error instanceof TimeoutError || isRetryable(error)
      if (!retryable || attempt === total - 1) throw error

      onRetry?.({ attempt: attempt + 1, error })
      await sleep(delays[attempt], signal)
    }
  }

  throw lastError
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

/**
 * Llama a `onBack` cuando el navegador recupera conexión.
 * Devuelve la función de limpieza.
 */
export function onConnectivityRestored(onBack) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('online', onBack)
  return () => window.removeEventListener('online', onBack)
}
