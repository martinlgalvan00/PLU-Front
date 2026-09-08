/**
 * Qué ve el público del cupo de atletas.
 *
 * El panel siempre ve el número real. `progressPublic` apaga el medidor
 * (queda “Campo limitado”). `totalPublic` solo oculta el “de 200”: el avance
 * y los lugares que quedan siguen visibles.
 */
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

  if (progressPublic === false) {
    return {
      mode: 'hidden',
      showTotal: false,
      registered: current,
      slots: total,
      remaining: left,
      percent,
    }
  }

  return {
    mode: 'meter',
    showTotal: totalPublic !== false,
    registered: current,
    slots: total,
    remaining: left,
    percent,
  }
}
