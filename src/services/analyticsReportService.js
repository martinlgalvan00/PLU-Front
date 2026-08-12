import { apiGet } from '../lib/api.js'

/**
 * analyticsReportService.js — PLU ARG
 *
 * Lectura del informe de analitica para el panel. Separado de
 * `analyticsService.js`, que es el tracker que corre en el sitio publico: uno
 * escribe y esta en cada pagina, el otro lee y solo existe detras de
 * `admin.analytics.read`.
 *
 * Todo llega agregado desde Postgres. El navegador nunca recibe eventos
 * individuales, que tienen identidad vinculada al atleta.
 */

function rangeQuery({ days = 30, from, to, limit, path, deviceType } = {}) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (!from && !to) params.set('days', String(days))
  if (limit) params.set('limit', String(limit))
  if (path) params.set('path', path)
  if (deviceType) params.set('deviceType', deviceType)
  return params.toString()
}

export async function fetchAnalyticsOverview(range) {
  return apiGet(`/api/analytics/overview?${rangeQuery(range)}`)
}

export async function fetchAnalyticsPages(range) {
  const result = await apiGet(`/api/analytics/pages?${rangeQuery(range)}`)
  return result?.pages ?? []
}

export async function fetchAnalyticsFlows(range) {
  const result = await apiGet(`/api/analytics/flows?${rangeQuery(range)}`)
  return result?.flows ?? []
}

export async function fetchAnalyticsHeatmap(range) {
  return apiGet(`/api/analytics/heatmap?${rangeQuery(range)}`)
}

export async function fetchAnalyticsFunnel(range) {
  const result = await apiGet(`/api/analytics/funnel?${rangeQuery(range)}`)
  return result?.steps ?? []
}

/** Lo mas usado del sitio entero, por elemento y no por ruta. */
export async function fetchAnalyticsElements(range) {
  const result = await apiGet(`/api/analytics/elements?${rangeQuery(range)}`)
  return result?.elements ?? []
}

/**
 * Recorrido de un atleta puntual. Requiere `admin.analytics.identity` y el
 * backend registra la consulta en la auditoria operativa: es la unica lectura
 * del informe que baja detalle de una persona identificada.
 */
export async function fetchAthleteJourney(athleteId, range) {
  return apiGet(
    `/api/analytics/athletes/${encodeURIComponent(athleteId)}/journey?${rangeQuery(range)}`,
  )
}

/**
 * Conversion entre pasos consecutivos del embudo. Se calcula acá y no en SQL
 * porque es presentacion: la RPC devuelve el conteo por paso, que es el dato.
 */
export function withFunnelRates(steps = []) {
  const entry = steps[0]?.visitors ?? 0
  return steps.map((step, index) => {
    const previous = index === 0 ? entry : steps[index - 1].visitors
    return {
      ...step,
      // Sin visitantes en el paso previo la tasa no esta definida; mostrar 0%
      // sugeriria una caida que no ocurrio.
      stepRate: previous > 0 ? step.visitors / previous : null,
      totalRate: entry > 0 ? step.visitors / entry : null,
      dropoff: previous > 0 ? Math.max(0, previous - step.visitors) : 0,
    }
  })
}
