/**
 * Qué ve el público del cupo de atletas.
 *
 * El panel siempre ve el número real.
 * - `progressPublic` apagado: “Campo limitado”, sin números.
 * - `progressPublic` prendido: medidor con anotados, restantes y barra.
 * - `totalPublic` solo decide si también se publica el total (el “/200”).
 */

export const PUBLIC_CAPACITY_FILLING_PERCENT = 50
export const PUBLIC_CAPACITY_TIGHT_PERCENT = 80

export function publicCapacityBand({ percent = 0, remaining = 0 } = {}) {
  const fill = Math.max(0, Number(percent) || 0)
  const left = Math.max(0, Number(remaining) || 0)
  if (left <= 0 || fill >= 100) return 'full'
  if (fill >= PUBLIC_CAPACITY_TIGHT_PERCENT) return 'tight'
  if (fill >= PUBLIC_CAPACITY_FILLING_PERCENT) return 'filling'
  return 'open'
}

export function describePublicCapacity({
  progressPublic = true,
  totalPublic = true,
  registered = 0,
  slots = 0,
  remaining = null,
} = {}) {
  const total = Math.max(0, Number(slots) || 0)
  const current = Math.max(0, Number(registered) || 0)
  const left =
    remaining == null ? Math.max(total - current, 0) : Math.max(0, Number(remaining) || 0)
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0
  const band = publicCapacityBand({ percent, remaining: left })

  if (progressPublic === false) {
    return {
      mode: 'hidden',
      band: 'hidden',
      showTotal: false,
      showNumbers: false,
      registered: current,
      slots: total,
      remaining: left,
      percent,
    }
  }

  return {
    mode: 'meter',
    band,
    showTotal: totalPublic !== false,
    showNumbers: true,
    registered: current,
    slots: total,
    remaining: left,
    percent,
  }
}
