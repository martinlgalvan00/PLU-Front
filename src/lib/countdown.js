const MS_PER_SECOND = 1000
const MS_PER_MINUTE = 60 * MS_PER_SECOND
const MS_PER_HOUR = 60 * MS_PER_MINUTE
const MS_PER_DAY = 24 * MS_PER_HOUR

/**
 * Desglosa el tiempo restante hasta `endsAt` en unidades enteras.
 * Clamp a 0; `expired` cuando totalMs <= 0.
 * `weeks` + `daysRemainder` permiten tickers con semanas como unidad dominante.
 *
 * @param {string|number|Date|null|undefined} endsAt
 * @param {Date|number} [now]
 * @returns {{
 *   totalMs: number,
 *   weeks: number,
 *   days: number,
 *   daysRemainder: number,
 *   hours: number,
 *   minutes: number,
 *   seconds: number,
 *   expired: boolean,
 * }}
 */
export function getCountdownParts(endsAt, now = new Date()) {
  const endMs = endsAt instanceof Date ? endsAt.getTime() : new Date(endsAt).getTime()
  const nowMs = now instanceof Date ? now.getTime() : Number(now)

  if (!Number.isFinite(endMs) || !Number.isFinite(nowMs)) {
    return {
      totalMs: 0,
      weeks: 0,
      days: 0,
      daysRemainder: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      expired: true,
    }
  }

  const totalMs = Math.max(0, endMs - nowMs)
  const expired = totalMs <= 0

  const days = Math.floor(totalMs / MS_PER_DAY)
  const weeks = Math.floor(days / 7)
  const daysRemainder = days % 7
  const hours = Math.floor((totalMs % MS_PER_DAY) / MS_PER_HOUR)
  const minutes = Math.floor((totalMs % MS_PER_HOUR) / MS_PER_MINUTE)
  const seconds = Math.floor((totalMs % MS_PER_MINUTE) / MS_PER_SECOND)

  return { totalMs, weeks, days, daysRemainder, hours, minutes, seconds, expired }
}

/**
 * Inicio de un evento como instante parseable. Prioriza `startsAt`; si solo hay
 * fecha de calendario asume las 09:00 de Argentina (UTC-3), igual que el resto
 * de los contadores de Pitbull.
 *
 * @param {{ startsAt?: string, dateISO?: string } | null | undefined} event
 * @returns {string|null}
 */
export function resolveEventStartsAt(event) {
  if (event?.startsAt) return event.startsAt
  if (event?.dateISO) return `${event.dateISO}T09:00:00-03:00`
  return null
}

/**
 * Unidad dominante de la cuenta regresiva: semanas mientras falte al menos una,
 * después días y, en el último día, horas. Es la misma regla que usa la card
 * de Pitbull, así "FALTAN 8 SEMANAS" se actualiza solo a "FALTAN 6 DÍAS", etc.
 *
 * @param {ReturnType<typeof getCountdownParts>} parts
 * @returns {{ unit: 'weeks'|'days'|'hours', value: number }}
 */
export function getCountdownHeadline(parts) {
  if (parts.weeks > 0) return { unit: 'weeks', value: parts.weeks }
  if (parts.days > 0) return { unit: 'days', value: parts.days }
  return { unit: 'hours', value: Math.max(1, parts.hours) }
}

/**
 * Titular de cuenta regresiva ("8 semanas") para un inicio dado, o `null` si
 * no hay fecha o el evento ya empezó. Es lo que comparten la entrada de
 * Pitbull, la card "Hasta el Classic" y la ficha del hero.
 *
 * @param {string|null|undefined} startsAt
 * @param {Date|number} [now]
 * @returns {{ unit: 'weeks'|'days'|'hours', value: number } | null}
 */
export function getEventCountdownHeadline(startsAt, now = new Date()) {
  if (!startsAt) return null
  const parts = getCountdownParts(startsAt, now)
  return parts.expired ? null : getCountdownHeadline(parts)
}
