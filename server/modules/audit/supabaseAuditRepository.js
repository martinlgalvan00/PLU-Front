import { PRIMARY_ORGANIZATION_ID } from '../../lib/organizations.js'
import { assertSupabaseResult, requireSupabaseClient } from '../../lib/supabaseRpc.js'

/**
 * supabaseAuditRepository.js — PLU ARG
 *
 * Lectura de `operational_audit_events`: una proyección única de la bitácora
 * transaccional de dominio y de las transiciones append-only de emails,
 * webhooks y conciliaciones de pago.
 *
 * Hasta ahora el panel no la leía: mostraba un historial armado en el browser
 * y guardado en localStorage, distinto para cada operador y perdido al limpiar
 * el navegador.
 *
 * Este repositorio es solo lectura a propósito. Los efectos transaccionales
 * los auditan triggers/RPC; la API agrega únicamente eventos de borde que no
 * existen en Postgres (login fallido y error de render del Brick).
 */
export function createSupabaseAuditRepository(
  client,
  { organizationId = PRIMARY_ORGANIZATION_ID } = {},
) {
  requireSupabaseClient(client)

  return {
    async list({
      action,
      entityType,
      entityId,
      entityIds,
      actorType,
      source,
      status,
      search,
      limit = 100,
      before,
      beforeId,
    } = {}) {
      let query = client
        .from('operational_audit_events')
        .select(
          'id, source, action, entity_type, entity_id, actor_type, actor_id, status, severity, metadata, created_at',
        )
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        // Desempate determinístico: una transacción audita varios efectos con
        // el mismo `now()`, así que el orden por fecha sola no es total y la
        // página siguiente podría saltear filas empatadas.
        .order('id', { ascending: false })
        .limit(limit)

      if (action) query = query.eq('action', action)
      if (entityType) query = query.eq('entity_type', entityType)
      if (entityId) query = query.eq('entity_id', entityId)
      // La actividad de un atleta se reparte entre su propia entidad y las de
      // sus afiliaciones, inscripciones y órdenes: se resuelve en una consulta
      // y no en una por entidad.
      if (entityIds?.length) query = query.in('entity_id', entityIds)
      if (actorType) query = query.eq('actor_type', actorType)
      if (source) query = query.eq('source', source)
      if (status) query = query.eq('status', status)
      // Paginación por cursor y no por offset: la tabla crece por el final y
      // un offset se corre solo cuando entra un registro nuevo mientras se
      // pagina. Con `beforeId` el cursor es compuesto: excluye lo ya visto
      // por fecha E id, sin perder las filas que comparten timestamp.
      if (before && beforeId) {
        query = query.or(
          `created_at.lt.${before},and(created_at.eq.${before},id.lt.${beforeId})`,
        )
      } else if (before) {
        query = query.lt('created_at', before)
      }
      if (search) query = query.or(`entity_id.ilike.%${search}%,actor_id.ilike.%${search}%`)

      // Sin `await` el builder llega crudo a assertSupabaseResult, `data` queda
      // undefined y `/api/audit` explota al leer `entries.length` (500).
      return assertSupabaseResult(await query, 'No se pudo leer la auditoría.')
    },

    /**
     * Acciones y actores presentes, para poblar los filtros con lo que existe
     * de verdad en vez de una lista fija que se desactualiza cada vez que una
     * RPC nueva empieza a auditar.
     */
    async facets({ limit = 1000 } = {}) {
      const rows = assertSupabaseResult(
        await client
          .from('operational_audit_events')
          .select('source, action, entity_type, actor_type, status')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(limit),
        'No se pudieron leer los filtros de auditoría.',
      )

      const unique = (key) => [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort()

      return {
        actions: unique('action'),
        entityTypes: unique('entity_type'),
        actorTypes: unique('actor_type'),
        sources: unique('source'),
        statuses: unique('status'),
      }
    },

    async overview() {
      return assertSupabaseResult(
        await client.rpc('get_operational_audit_summary', {
          p_organization_id: organizationId,
        }),
        'No se pudo calcular el estado operativo.',
      )
    },
  }
}
