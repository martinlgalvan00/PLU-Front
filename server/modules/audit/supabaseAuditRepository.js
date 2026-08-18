import { PRIMARY_ORGANIZATION_ID } from '../../lib/organizations.js'
import { assertSupabaseResult, requireSupabaseClient } from '../../lib/supabaseRpc.js'
import {
  AUDIT_CATEGORY_KEYS,
  UNCATEGORIZED,
  auditCategoryPatterns,
  categorizeAuditAction,
  withAuditCategory,
} from './auditActionCategories.js'

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
const EVENT_COLUMNS =
  'id, source, action, entity_type, entity_id, actor_type, actor_id, status, severity, metadata, created_at'

export function createSupabaseAuditRepository(
  client,
  { organizationId = PRIMARY_ORGANIZATION_ID } = {},
) {
  requireSupabaseClient(client)

  const events = () =>
    client
      .from('operational_audit_events')
      .select(EVENT_COLUMNS)
      .eq('organization_id', organizationId)

  return {
    async getById(id) {
      const rows = assertSupabaseResult(
        await events().eq('id', id).limit(1),
        'No se pudo leer el evento de auditoría.',
      )
      return rows?.[0] ? withAuditCategory(rows)[0] : null
    },

    /**
     * Contexto de un evento: qué venía pasando alrededor.
     *
     * Un error suelto no se diagnostica. "Falló el cobro" no dice si el atleta
     * venía reintentando hace media hora, si el mail de verificación le había
     * rebotado antes, o si el operador acababa de apagar el canal manual. Eso
     * está en la bitácora, pero repartido en filas que nadie cruza a mano.
     *
     * Se devuelven tres ejes distintos en vez de una lista mezclada, porque
     * responden preguntas distintas y tienen fuerza probatoria distinta:
     *
     *   - `request`: mismo `requestId`. Es la cadena causal exacta —lo que
     *     ocurrió dentro de la misma llamada HTTP—, no una coincidencia
     *     temporal. Es el eje más fuerte y por eso va primero.
     *   - `actor`: lo que esa misma persona hizo antes y después. Es el "qué
     *     hizo el usuario anteriormente".
     *   - `entity`: la historia del objeto afectado, sin importar quién lo tocó.
     *
     * Mezclarlos daría un timeline que parece causal y no lo es.
     */
    async context(event, { limit = 20, windowHours = 24 } = {}) {
      if (!event?.created_at) return { request: [], actorBefore: [], actorAfter: [], entity: [] }

      const at = event.created_at
      const requestId = event.metadata?.requestId ?? null
      const since = new Date(new Date(at).getTime() - windowHours * 3600 * 1000).toISOString()

      const run = async (query, fallback = []) => {
        try {
          return assertSupabaseResult(await query, 'No se pudo leer el contexto.') ?? fallback
        } catch {
          // El contexto es ayuda diagnóstica: si un eje falla, el evento se
          // abre igual con los demás en vez de romper el detalle entero.
          return fallback
        }
      }

      const [request, actorBefore, actorAfter, entity] = await Promise.all([
        requestId
          ? run(
              events()
                .eq('metadata->>requestId', requestId)
                .order('created_at', { ascending: true })
                .limit(limit * 2),
            )
          : Promise.resolve([]),

        // El actor puede ser `system` sin id (jobs, webhooks). En ese caso el
        // eje de actor no aporta nada y se deja vacío en vez de devolver la
        // actividad de todos los procesos automáticos juntos.
        event.actor_id
          ? run(
              events()
                .eq('actor_id', event.actor_id)
                .lt('created_at', at)
                .gte('created_at', since)
                .order('created_at', { ascending: false })
                .limit(limit),
            )
          : Promise.resolve([]),

        event.actor_id
          ? run(
              events()
                .eq('actor_id', event.actor_id)
                .gt('created_at', at)
                .order('created_at', { ascending: true })
                .limit(limit),
            )
          : Promise.resolve([]),

        event.entity_id
          ? run(
              events()
                .eq('entity_id', event.entity_id)
                .neq('id', event.id)
                .order('created_at', { ascending: false })
                .limit(limit),
            )
          : Promise.resolve([]),
      ])

      return {
        // Cronológico ascendente: se lee como lo que pasó, en el orden en que pasó.
        // Los cuatro ejes llevan categoría igual que la tabla: es lo que permite
        // ver de un vistazo que un `payment_webhook.failed` y un
        // `payment.webhook_failed` del mismo requestId son el mismo hecho.
        request: withAuditCategory(request),
        actorBefore: withAuditCategory(actorBefore.slice().reverse()),
        actorAfter: withAuditCategory(actorAfter),
        entity: withAuditCategory(entity.slice().reverse()),
      }
    },

    async list({
      action,
      category,
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
      /**
       * Filtro por categoria: agrupa los nombres que describen el mismo hecho
       * con distinta convencion (`payment.webhook_failed` del código y
       * `payment_webhook.failed` del trigger). Se traduce a un `or(...like...)`
       * sobre `action`, que usa el mismo índice que el filtro exacto.
       *
       * `otro` no se puede expresar como `like` —es el complemento de todas las
       * demás categorías— así que se resuelve descartando filas sobre la página
       * ya leída, más abajo.
       */
      const categoryPatterns =
        category && category !== UNCATEGORIZED ? auditCategoryPatterns(category) : null
      if (categoryPatterns?.include?.length) {
        query = query.or(
          categoryPatterns.include.map((pattern) => `action.like.${pattern}`).join(','),
        )
        // Resta de las categorías anteriores: sin esto `cobro` (`payment.%`)
        // arrastra los `payment.webhook_*` que ya pertenecen a `webhook`.
        for (const pattern of categoryPatterns.exclude) {
          query = query.not('action', 'like', pattern)
        }
      }
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
        query = query.or(`created_at.lt.${before},and(created_at.eq.${before},id.lt.${beforeId})`)
      } else if (before) {
        query = query.lt('created_at', before)
      }
      if (search) query = query.or(`entity_id.ilike.%${search}%,actor_id.ilike.%${search}%`)

      // Sin `await` el builder llega crudo a assertSupabaseResult, `data` queda
      // undefined y `/api/audit` explota al leer `entries.length` (500).
      const rows = withAuditCategory(
        assertSupabaseResult(await query, 'No se pudo leer la auditoría.'),
      )

      // `otro` es el único filtro que no se puede empujar a la base. Se aplica
      // acá asumiendo el costo: la página puede volver más corta que `limit`,
      // que es preferible a devolver filas de otras categorías.
      return category === UNCATEGORIZED
        ? rows.filter((row) => row.category === UNCATEGORIZED)
        : rows
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

      /**
       * Solo las categorías presentes, y en el orden canónico —no alfabético—
       * para que el filtro no ofrezca opciones que devolverían cero filas ni
       * cambie de orden entre aperturas del panel.
       */
      const present = new Set(rows.map((row) => categorizeAuditAction(row.action)))

      return {
        actions: unique('action'),
        categories: AUDIT_CATEGORY_KEYS.filter((key) => present.has(key)),
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
