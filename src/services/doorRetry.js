import { CHECKIN_SYNC } from '../lib/checkinSyncConfig.js'
import { isRetryableCheckinFailure } from './checkinFailure.js'

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/** Pausa corta entre reintentos de puerta. El intento 1 no espera. */
export function doorLiveDelayMs(failedAttempt) {
  const delays = CHECKIN_SYNC.liveRetryDelaysMs
  const index = Math.max(0, Number(failedAttempt) - 1)
  return delays[Math.min(index, delays.length - 1)] ?? 0
}

/**
 * Repite un pedido de puerta solo si la falla es de red, cupo o servidor.
 * Un 409 o un 404 sale al primer intento: reintentarlo no cambia el veredicto.
 */
export async function runDoorAttempts(task, { attempts = CHECKIN_SYNC.maxAttempts, sleep = wait } = {}) {
  const total = Math.max(1, attempts)
  let lastError
  for (let attempt = 1; attempt <= total; attempt += 1) {
    try {
      return await task()
    } catch (error) {
      lastError = error
      if (!isRetryableCheckinFailure(error) || attempt === total) throw error
      await sleep(doorLiveDelayMs(attempt))
    }
  }
  throw lastError
}
