const MS_PER_SECOND = 1000
const MS_PER_MINUTE = 60 * MS_PER_SECOND
const MS_PER_HOUR = 60 * MS_PER_MINUTE
const MS_PER_DAY = 24 * MS_PER_HOUR

/**
 * Desglosa el tiempo restante hasta `endsAt` en unidades enteras.
 * Clamp a 0; `expired` cuando totalMs <= 0.
 *
 * @param {string|number|Date|null|undefined} endsAt
 * @param {Date|number} [now]
 * @returns {{ totalMs: number, days: number, hours: number, minutes: number, seconds: number, expired: boolean }}
 */
export function getCountdownParts(endsAt, now = new Date()) {
  const endMs = endsAt instanceof Date ? endsAt.getTime() : new Date(endsAt).getTime()
  const nowMs = now instanceof Date ? now.getTime() : Number(now)

  if (!Number.isFinite(endMs) || !Number.isFinite(nowMs)) {
    return { totalMs: 0, days: 0, hours: 0, minutes: 0, seconds: 0, expired: true }
  }

  const totalMs = Math.max(0, endMs - nowMs)
  const expired = totalMs <= 0

  const days = Math.floor(totalMs / MS_PER_DAY)
  const hours = Math.floor((totalMs % MS_PER_DAY) / MS_PER_HOUR)
  const minutes = Math.floor((totalMs % MS_PER_HOUR) / MS_PER_MINUTE)
  const seconds = Math.floor((totalMs % MS_PER_MINUTE) / MS_PER_SECOND)

  return { totalMs, days, hours, minutes, seconds, expired }
}
