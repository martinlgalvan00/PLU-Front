/**
 * analyticsCalendar.js — PLU ARG
 *
 * Helpers puros del calendario de visitas y de la serie diaria. Sin React ni
 * IO: toda la logica de fechas y de extremos queda aca para poder probarla
 * sola, igual que `withFunnelRates` convive con el servicio del informe.
 */

/**
 * Mejor y peor dia del rango, solo entre dias con visitas. Un dia en cero no
 * es "el peor dia": es un dia sin dato, y coronarlo asi esconderia justamente
 * el dia mas bajo con trafico real.
 */
export function findDayExtremes(series = [], metric = 'visitors') {
  const withTraffic = series.filter((day) => Number(day?.[metric] ?? 0) > 0)
  if (withTraffic.length === 0) return { best: null, worst: null }

  let best = withTraffic[0]
  let worst = withTraffic[0]
  for (const day of withTraffic) {
    if (Number(day[metric]) > Number(best[metric])) best = day
    if (Number(day[metric]) < Number(worst[metric])) worst = day
  }
  return { best, worst }
}

/**
 * Matriz de un mes para el calendario: semanas de lunes a domingo, con null en
 * los huecos del borde. Mes en base 0 como `Date` (0 = enero).
 */
export function buildMonthMatrix(year, month) {
  const first = new Date(Date.UTC(year, month, 1))
  // Lunes=0 .. Domingo=6. getUTCDay() es domingo=0; lo corrijo.
  const leading = (first.getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

  const cells = []
  for (let i = 0; i < leading; i += 1) cells.push(null)
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day)

  while (cells.length % 7 !== 0) cells.push(null)

  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** `YYYY-MM-DD` de un dia del mes, sin sorpresas de zona horaria. */
export function monthDayKey(year, month, day) {
  const monthLabel = String(month + 1).padStart(2, '0')
  const dayLabel = String(day).padStart(2, '0')
  return `${year}-${monthLabel}-${dayLabel}`
}

/**
 * Intensidad 0..1 de una celda del calendario. Raiz cuadrada por la misma
 * razon que el heatmap de clicks: un unico dia muy alto aplanaba el resto
 * contra el fondo y los dias intermedios dejaban de distinguirse.
 */
export function calendarIntensity(value, max) {
  if (!(max > 0) || !(value > 0)) return 0
  return Math.sqrt(value / max)
}
