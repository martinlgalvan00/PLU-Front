import { PRIMARY_ORGANIZATION_ID } from '../../lib/organizations.js'
import { assertSupabaseResult, requireSupabaseClient } from '../../lib/supabaseRpc.js'

/**
 * supabaseAnalyticsRepository.js — PLU ARG
 *
 * Toda la lectura del panel pasa por RPC agregadas y nunca por un `select` a
 * `analytics_events`. Es a proposito: el detalle crudo tiene identidad vinculada
 * al atleta, y agregar en Postgres evita que el navegador reciba filas
 * personales para armar el informe del lado del cliente.
 */
export function createSupabaseAnalyticsRepository(
  client,
  { organizationId = PRIMARY_ORGANIZATION_ID } = {},
) {
  requireSupabaseClient(client)

  const rpc = async (name, args, fallback) =>
    assertSupabaseResult(await client.rpc(name, args), fallback)

  return {
    async ingest({ visitorId, events, athleteId = null, context = {} }) {
      return rpc(
        'ingest_analytics_events',
        {
          p_visitor_id: visitorId,
          p_events: events,
          p_athlete_id: athleteId,
          p_context: context,
          p_organization_id: organizationId,
        },
        'No se pudo registrar la actividad.',
      )
    },

    async overview({ from, to }) {
      return rpc(
        'get_analytics_overview',
        { p_from: from, p_to: to, p_organization_id: organizationId },
        'No se pudo calcular el resumen de trafico.',
      )
    },
    async operationalSummary({ from, to }) {
      return rpc('get_analytics_operational_summary', { p_from: from, p_to: to, p_organization_id: organizationId }, 'No se pudo calcular el resumen operativo.')
    },
    async operationalAlerts() {
      return rpc('get_operational_alerts', { p_organization_id: organizationId }, 'No se pudieron leer las alertas operativas.') ?? []
    },

    /**
     * Presencia en vivo. No lleva rango: "ahora" lo define la RPC contra el
     * reloj del servidor, y dejar que el cliente mande la ventana permitiria
     * pedir "los ultimos 30 dias" por un endpoint sin indices para eso.
     */
    async live({ windowMinutes = 5 } = {}) {
      return rpc(
        'get_analytics_live',
        { p_organization_id: organizationId, p_window_minutes: windowMinutes },
        'No se pudo leer la actividad en vivo.',
      )
    },

    /**
     * Accesos del periodo: quienes entraron, quienes no pudieron y por que.
     * Lee la bitacora de identidad, no la analitica: un acceso es un hecho
     * auditado, no una visita.
     */
    async accessMetrics({ from, to }) {
      return rpc(
        'get_access_metrics',
        { p_from: from, p_to: to, p_organization_id: organizationId },
        'No se pudieron leer las metricas de acceso.',
      )
    },

    async pages({ from, to, limit = 25 }) {
      return rpc(
        'get_analytics_pages',
        { p_from: from, p_to: to, p_limit: limit, p_organization_id: organizationId },
        'No se pudieron leer las paginas.',
      ) ?? []
    },

    async flows({ from, to, limit = 30 }) {
      return rpc(
        'get_analytics_flows',
        { p_from: from, p_to: to, p_limit: limit, p_organization_id: organizationId },
        'No se pudieron leer los recorridos.',
      ) ?? []
    },

    async heatmap({ path, from, to, deviceType = null }) {
      return rpc(
        'get_analytics_heatmap',
        {
          p_path: path,
          p_from: from,
          p_to: to,
          p_organization_id: organizationId,
          p_device_type: deviceType,
        },
        'No se pudo construir el mapa de calor.',
      )
    },

    async funnel({ steps, from, to }) {
      return rpc(
        'get_analytics_funnel',
        { p_steps: steps, p_from: from, p_to: to, p_organization_id: organizationId },
        'No se pudo calcular el embudo.',
      ) ?? []
    },

    /** Lo mas usado del sitio entero, agrupado por elemento y no por ruta. */
    async elements({ from, to, limit = 25 }) {
      return rpc(
        'get_analytics_elements',
        { p_from: from, p_to: to, p_limit: limit, p_organization_id: organizationId },
        'No se pudieron leer los elementos mas usados.',
      ) ?? []
    },

    /**
     * Unico metodo que devuelve detalle de una persona identificada. El endpoint
     * que lo expone pide un permiso propio y deja registro de la consulta.
     */
    async athleteJourney({ athleteId, from, to, limit = 200 }) {
      return rpc(
        'get_analytics_athlete_journey',
        {
          p_athlete_id: athleteId,
          p_from: from,
          p_to: to,
          p_limit: limit,
          p_organization_id: organizationId,
        },
        'No se pudo leer el recorrido del atleta.',
      )
    },
  }
}
