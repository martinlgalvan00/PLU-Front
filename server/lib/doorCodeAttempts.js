/**
 * Freno de adivinanza del código hablado.
 *
 * El código es corto a propósito. Una cuenta de puerta
 * comprometida no puede probarlos en ráfaga: 12 fallos en un minuto traban
 * esa cuenta 30 segundos. Un acierto reinicia el contador, así que una fila
 * real —donde casi todos los códigos existen— no se traba por un typo.
 * El código en sí no se guarda.
 */

export function createDoorCodeAttemptGuard({
  now = () => Date.now(),
  maxFailures = 12,
  windowMs = 60_000,
  lockMs = 30_000,
} = {}) {
  const buckets = new Map()

  function bucketFor(key) {
    const current = buckets.get(key)
    if (current) return current
    const created = { failures: [], lockedUntil: 0 }
    buckets.set(key, created)
    return created
  }

  return {
    check(key) {
      if (!key) return { ok: true }
      const bucket = buckets.get(key)
      const clock = now()
      if (!bucket || !bucket.lockedUntil || bucket.lockedUntil <= clock) return { ok: true }
      return { ok: false, retryAt: bucket.lockedUntil }
    },
    record(key, found) {
      if (!key) return { ok: true }
      if (found) {
        buckets.delete(key)
        return { ok: true }
      }
      const clock = now()
      const bucket = bucketFor(key)
      bucket.failures = bucket.failures.filter((at) => clock - at < windowMs)
      bucket.failures.push(clock)
      if (bucket.failures.length >= maxFailures) {
        bucket.lockedUntil = clock + lockMs
        bucket.failures = []
        return { ok: false, retryAt: bucket.lockedUntil }
      }
      return { ok: true }
    },
  }
}

export const doorCodeAttempts = createDoorCodeAttemptGuard()
