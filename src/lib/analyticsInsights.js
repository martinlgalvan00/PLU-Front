/**
 * analyticsInsights.js — PLU ARG
 *
 * Titulares del período calculados a partir de lo que el informe ya trae:
 * qué fracción llegó hasta el final del embudo, dónde se pierde más gente,
 * cuál fue el mejor día y cuándo entra más tráfico. Ninguno inventa un dato:
 * si no hay base suficiente para decir algo con sentido, no se emite.
 *
 * Devuelve estructuras y no texto: el copy vive en i18n y el formato de
 * números y fechas depende del idioma, así que lo resuelve el componente.
 */

const MAX_INSIGHTS = 4

/** Mínimo de personas en el paso previo para que una caída signifique algo. */
const MIN_FUNNEL_BASE = 20
/** Caída (fracción) por debajo de la cual no vale la pena señalar un tramo. */
const MIN_NOTABLE_LOSS = 0.2
/** Diferencia mínima entre días hábiles y fines de semana para destacarla. */
const MIN_RHYTHM_GAP = 0.15
/** Veces el promedio diario desde las que "mejor día" merece un "×". */
const MIN_BEST_DAY_RATIO = 1.5

function parseDay(day) {
  const [year, month, date] = String(day ?? '')
    .split('-')
    .map(Number)
  const parsed = new Date(year, (month ?? 1) - 1, date ?? 1)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function average(values) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

/** Del primer al último paso del embudo: cuánta gente llegó hasta el final. */
function conversionInsight(funnel) {
  if (funnel.length < 2) return null
  const first = funnel[0]
  const last = funnel[funnel.length - 1]
  const entered = Number(first.visitors ?? 0)
  const completed = Number(last.visitors ?? 0)
  if (entered < 10) return null

  return {
    id: 'conversion',
    rate: completed / entered,
    entered,
    completed,
    firstStep: first.step_name,
    lastStep: last.step_name,
  }
}

/** El tramo del embudo donde cae la mayor proporción de gente. */
function leakInsight(funnel) {
  let worst = null

  for (let index = 1; index < funnel.length; index += 1) {
    const previous = Number(funnel[index - 1].visitors ?? 0)
    const current = Number(funnel[index].visitors ?? 0)
    if (previous < MIN_FUNNEL_BASE || current >= previous) continue

    const lossRate = (previous - current) / previous
    const lost = previous - current
    if (!worst || lossRate > worst.lossRate || (lossRate === worst.lossRate && lost > worst.lost)) {
      worst = {
        id: 'leak',
        lossRate,
        lost,
        from: funnel[index - 1].step_name,
        to: funnel[index].step_name,
      }
    }
  }

  return worst && worst.lossRate >= MIN_NOTABLE_LOSS ? worst : null
}

function bestDayInsight(series) {
  if (series.length === 0) return null

  const best = series.reduce((top, item) =>
    Number(item.visitors ?? 0) > Number(top.visitors ?? 0) ? item : top,
  )
  const visitors = Number(best.visitors ?? 0)
  if (visitors <= 0) return null

  const mean = average(series.map((item) => Number(item.visitors ?? 0)))
  const ratio = mean > 0 ? visitors / mean : null

  return {
    id: 'bestDay',
    day: best.day,
    visitors,
    ratio: ratio !== null && ratio >= MIN_BEST_DAY_RATIO ? ratio : null,
  }
}

/** ¿Entra más gente entre semana o los fines de semana? Por día, no en total. */
function rhythmInsight(series) {
  const weekdays = []
  const weekend = []

  for (const item of series) {
    const date = parseDay(item.day)
    if (!date) continue
    const dow = date.getDay()
    ;(dow === 0 || dow === 6 ? weekend : weekdays).push(Number(item.visitors ?? 0))
  }

  // Con pocos días de cada tipo el promedio es ruido, no un patrón.
  if (weekdays.length < 4 || weekend.length < 2) return null

  const weekdayAverage = average(weekdays)
  const weekendAverage = average(weekend)
  const low = Math.min(weekdayAverage, weekendAverage)
  if (low <= 0) return null

  const gap = Math.abs(weekdayAverage - weekendAverage) / low
  if (gap < MIN_RHYTHM_GAP) return null

  return {
    id: 'rhythm',
    leader: weekdayAverage > weekendAverage ? 'weekdays' : 'weekend',
    gap,
  }
}

function topPageInsight(pages, totalPageviews) {
  const top = pages[0]
  const pageviews = Number(top?.pageviews ?? 0)
  if (!top || pageviews <= 0) return null

  const listed = pages.reduce((sum, page) => sum + Number(page.pageviews ?? 0), 0)
  // El total del período es el denominador correcto; si no llegó o es menor
  // que lo listado (datos de ventanas distintas), se cae a lo que se ve.
  const base = Number(totalPageviews) >= pageviews ? Number(totalPageviews) : listed
  if (base <= 0) return null

  return { id: 'topPage', path: top.path, pageviews, share: pageviews / base }
}

/**
 * @param {object} data
 * @param {Array} [data.funnel] pasos del embudo (`step_name`, `visitors`), en orden
 * @param {Array} [data.pages] ranking de páginas, de más a menos vista
 * @param {Array} [data.series] serie diaria (`day`, `visitors`)
 * @param {number} [data.pageviews] páginas vistas del período
 */
export function buildAnalyticsInsights({ funnel = [], pages = [], series = [], pageviews } = {}) {
  return [
    conversionInsight(funnel),
    leakInsight(funnel),
    bestDayInsight(series),
    rhythmInsight(series),
    topPageInsight(pages, pageviews),
  ]
    .filter(Boolean)
    .slice(0, MAX_INSIGHTS)
}
