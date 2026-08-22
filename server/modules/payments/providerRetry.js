/**
 * providerRetry.js — PLU ARG
 *
 * Reintento in-process para llamadas a Mercado Pago que fallan por causas
 * transitorias: corte de red, timeout, 5xx del proveedor o rate limit (429).
 *
 * Complementa —no reemplaza— las dos redes que ya existen:
 *
 *   · La bandeja durable de webhooks y conciliaciones reintenta con backoff
 *     exponencial en minutos (ver `complete_payment_integration_event`).
 *     Cubre la falla larga: MP caído veinte minutos.
 *   · `reconcileAfterProviderError` relee la verdad del proveedor por
 *     `external_reference` cuando un POST de cobro explota sin respuesta.
 *     Cubre el "no sé si se creó".
 *
 * Esto cubre la falla corta: el blip de red o el 500 puntual que hoy convierte
 * una consulta legítima en un intento fallido que espera minutos en la cola.
 *
 * Política de reintento:
 *
 *   · Lecturas idempotentes (GET /v1/payments/:id, search, /users/me):
 *     reintentan red, timeout, 5xx y 429.
 *   · Escrituras (crear preferencia/pago/suscripción): reintentan SOLO 429.
 *     Un 429 es la única falla donde el proveedor garantiza que la request no
 *     se procesó. Un timeout o un 5xx sobre un POST de cobro puede haber
 *     cobrado igual: ahí NO se repite el POST a ciegas — se deja caer al
 *     camino de reconciliación, que primero pregunta qué pasó.
 *   · 4xx (excepto 429) nunca se reintenta: repetir una request inválida da
 *     la misma respuesta inválida.
 *
 * Para 429 se respeta `Retry-After` si el proveedor lo manda, con un techo:
 * estas llamadas viven dentro de un request HTTP o un worker con lote; una
 * espera más larga que el techo le corresponde a la cola durable, no a este
 * proceso.
 */

const DEFAULT_DELAYS_MS = Object.freeze([500, 1_500, 3_500])
const MAX_RETRY_AFTER_MS = 10_000
const JITTER_RATIO = 0.2

const NETWORK_FAILURE_PATTERN =
  /abort|timed? ?out|network|fetch failed|econn(reset|refused|aborted)?|socket hang up|eai_again|und_err|epipe|etimedout/i

function statusOf(error) {
  const raw =
    error?.provider?.apiResponseStatus ??
    error?.status ??
    error?.statusCode ??
    error?.response?.status
  const status = Number(raw)
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null
}

/** Recorre la cadena de causas: el corte de red suele venir envuelto. */
function isNetworkFailure(error) {
  for (let current = error, depth = 0; current && depth < 6; current = current.cause, depth += 1) {
    if (current?.name === 'AbortError' || current?.name === 'TimeoutError') return true
    if (NETWORK_FAILURE_PATTERN.test(String(current?.code ?? ''))) return true
    if (NETWORK_FAILURE_PATTERN.test(String(current?.message ?? ''))) return true
  }
  return false
}

function retryAfterMsOf(error) {
  const header =
    error?.provider?.retryAfterSeconds ??
    error?.headers?.['retry-after'] ??
    error?.headers?.get?.('retry-after') ??
    error?.response?.headers?.['retry-after'] ??
    error?.response?.headers?.get?.('retry-after')
  const seconds = Number(header)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return Math.min(Math.round(seconds * 1000), MAX_RETRY_AFTER_MS)
}

/**
 * Clasifica una falla del proveedor.
 *
 * @returns {{transient: boolean, reason: 'rate_limited'|'server_error'|'network'|null, retryAfterMs: number|null, status: number|null}}
 */
export function classifyProviderFailure(error) {
  const status = statusOf(error)
  if (status === 429) {
    return { transient: true, reason: 'rate_limited', retryAfterMs: retryAfterMsOf(error), status }
  }
  if (status !== null && status >= 500) {
    return { transient: true, reason: 'server_error', retryAfterMs: null, status }
  }
  // Un HttpError 502/503 fabricado por el adaptador sobre una causa de red
  // entra por la rama anterior; acá cae la falla cruda sin status HTTP.
  if (status === null && isNetworkFailure(error)) {
    return { transient: true, reason: 'network', retryAfterMs: null, status: null }
  }
  return { transient: false, reason: null, retryAfterMs: null, status }
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Ejecuta `run` reintentando fallas transitorias.
 *
 * @param {() => Promise<any>} run
 * @param {{
 *   idempotent?: boolean,   // true = lectura segura de repetir (GET). false = escritura: solo 429.
 *   delays?: number[],      // esperas base entre intentos (el 1.º es inmediato).
 *   sleep?: (ms: number) => Promise<void>,
 *   random?: () => number,
 *   onRetry?: (info: {attempt: number, delayMs: number, reason: string, status: number|null}) => void,
 * }} [options]
 */
export async function withTransientRetry(run, options = {}) {
  const {
    idempotent = false,
    delays = DEFAULT_DELAYS_MS,
    sleep = defaultSleep,
    random = Math.random,
    onRetry,
  } = options

  let lastError
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      lastError = error
      const failure = classifyProviderFailure(error)
      const retryable = failure.transient && (idempotent || failure.reason === 'rate_limited')
      if (!retryable || attempt === delays.length) throw error

      // Con Retry-After manda el proveedor: se espera lo pedido más un colchón
      // corto para no golpear en el mismo milisegundo en que expira la ventana.
      // Sin Retry-After, backoff exponencial con jitter (±20%) para que dos
      // procesos que fallaron juntos no reintenten sincronizados.
      const delayMs = failure.retryAfterMs
        ? failure.retryAfterMs + Math.round(random() * 250)
        : Math.max(0, Math.round(delays[attempt] * (1 + (random() * 2 - 1) * JITTER_RATIO)))

      onRetry?.({
        attempt: attempt + 1,
        delayMs,
        reason: failure.reason,
        status: failure.status,
      })
      await sleep(delayMs)
    }
  }
  throw lastError
}
