/**
 * checkinSyncConfig.js — PLU ARG
 *
 * Parámetros de la cola de puerta. El servidor sigue siendo quien decide si
 * el ingreso vale (`FOR UPDATE` + unique → PLU06). Acá solo se acota cuántos
 * pedidos salen juntos y cada cuánto se reintenta uno que no tuvo respuesta.
 */

export const CHECKIN_SYNC = Object.freeze({
  intervalMs: 25_000,
  concurrency: 4,
  maxAttempts: 8,
  baseDelayMs: 2_000,
  maxDelayMs: 60_000,
  jitterRatio: 0.2,
  snapshotTtlMs: 2 * 60_000,
  // Si la red no contesta en este tiempo, se muestra la foto local y el
  // servidor corrige el veredicto cuando llega. No es la validez del QR.
  scanBudgetMs: 800,
})

/**
 * Espera antes del próximo intento. `attemptCount` es el que acaba de fallar
 * (1 = primer fallo). `random` devuelve [0, 1) para poder fijar el jitter en tests.
 */
export function nextRetryDelayMs(attemptCount, random = Math.random) {
  const exponent = Math.max(0, Number(attemptCount) - 1)
  const exponential = CHECKIN_SYNC.baseDelayMs * 2 ** exponent
  const capped = Math.min(CHECKIN_SYNC.maxDelayMs, exponential)
  const jitter = capped * CHECKIN_SYNC.jitterRatio * random()
  return Math.round(capped + jitter)
}

/** La foto local todavía sirve: no hace falta bajar la lista de nuevo. */
export function isSnapshotFresh(downloadedAt, now = Date.now()) {
  if (!downloadedAt) return false
  const downloaded = Date.parse(downloadedAt)
  if (Number.isNaN(downloaded)) return false
  const age = now - downloaded
  return age >= 0 && age < CHECKIN_SYNC.snapshotTtlMs
}
