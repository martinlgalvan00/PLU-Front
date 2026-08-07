import { PRIMARY_ORGANIZATION_ID } from '../../lib/organizations.js'
import { assertSupabaseResult, requireSupabaseClient } from '../../lib/supabaseRpc.js'

/**
 * supabaseAuditRepository.js — PLU ARG
 *
 * Lectura de `domain_audit_logs`, la bitácora que las RPC de dominio vienen
 * escribiendo desde 20260716000000 (alta de afiliación, inscripción, ingreso
 * en puerta, aprobación de orden) y que 20260802120000 completó con el ciclo
 * de cobro (acreditación, activación, reembolso, vencimiento).
 *
 * Hasta ahora el panel no la leía: mostraba un historial armado en el browser
 * y guardado en localStorage, distinto para cada operador y perdido al limpiar
 * el navegador.
 *
 * Es solo lectura a propósito. Nadie escribe auditoría desde la API: la
 * escriben las RPC dentro de la misma transacción que aplica el efecto, que es
 * lo que hace que el registro no pueda divergir del hecho.
 */
export function createSupabaseAuditRepository(
  client,
  { organizationId = PRIMARY_ORGANIZATION_ID } = {},
) {
  requireSupabaseClient(client)

  return {
    async list({ action, entityType, entityId, entityIds, actorType, search, limit = 100, before } = {}) {
      let query = client
        .from('domain_audit_logs')
        .select('id, action, entity_type, entity_id, actor_type, actor_id, metadata, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (action) query = query.eq('action', action)
      if (entityType) query = query.eq('entity_type', entityType)
      if (entityId) query = query.eq('entity_id', entityId)
      // La actividad de un atleta se reparte entre su propia entidad y las de
      // sus afiliaciones, inscripciones y órdenes: se resuelve en una consulta
      // y no en una por entidad.
      if (entityIds?.length) query = query.in('entity_id', entityIds)
      if (actorType) query = query.eq('actor_type', actorType)
      // Paginación por cursor y no por offset: la tabla crece por el final y
      // un offset se corre solo cuando entra un registro nuevo mientras se
      // pagina.
      if (before) query = query.lt('created_at', before)
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
          .from('domain_audit_logs')
          .select('action, entity_type, actor_type')
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
      }
    },
  }
}
