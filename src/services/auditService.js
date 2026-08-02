import { apiGet } from '../lib/api.js'

/**
 * auditService.js — PLU ARG
 *
 * Bitácora real del sistema. Hasta ahora el panel mostraba un historial que se
 * construía en el browser y se guardaba en localStorage: distinto para cada
 * operador, perdido al limpiar el navegador y sin relación con lo que había
 * pasado de verdad. Acá se lee `domain_audit_logs`, que las RPC escriben en la
 * misma transacción que aplica cada efecto de dominio.
 *
 * El servicio no traduce: devuelve la clave de acción y el componente resuelve
 * la etiqueta con i18n. Así una acción nueva en una RPC aparece igual en el
 * panel aunque todavía no tenga copy, en vez de desaparecer del listado.
 */

/** Tono de la fila: severidad operativa, no decoración. */
const ACTION_TONES = {
  'payment.applied': 'success',
  'payment.approved_manually': 'success',
  'payment.proof_uploaded': 'info',
  'membership.activated': 'success',
  'membership.revoked': 'danger',
  'membership.expired': 'warning',
  'membership.qr_rotated': 'warning',
  'membership_order.created': 'info',
  'registration.created': 'info',
  'registration.confirmed': 'success',
  'registration.cancelled': 'danger',
  'registration.checked_in': 'success',
  'ticket_order.created': 'info',
  'ticket_order.approved': 'success',
  'ticket.checked_in': 'success',
  'ticket_addon.redeemed': 'info',
  'event.upserted': 'info',
}

/**
 * Campos de metadata que vale la pena ver de un vistazo en la tabla, en orden
 * de utilidad operativa. El resto queda en el detalle expandido: mostrar todo
 * el jsonb en la fila convierte la tabla en un volcado ilegible.
 */
const SUMMARY_FIELDS = [
  'memberCode',
  'reference',
  'externalPaymentId',
  'amount',
  'concept',
  'orderStatus',
  'paymentStatus',
  'status',
  'eventId',
  'expirationDate',
]

export function auditActionTone(action) {
  return ACTION_TONES[action] ?? 'default'
}

function summarize(metadata) {
  if (!metadata || typeof metadata !== 'object') return []
  return SUMMARY_FIELDS.filter((field) => metadata[field] != null && metadata[field] !== '').map(
    (field) => ({ field, value: metadata[field] }),
  )
}

export function normalizeAuditEntry(row) {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actorType: row.actor_type,
    actorId: row.actor_id ?? null,
    metadata: row.metadata ?? {},
    summary: summarize(row.metadata),
    tone: auditActionTone(row.action),
    createdAt: row.created_at,
  }
}

export async function fetchAuditEntries(filters = {}) {
  const params = new URLSearchParams()
  for (const key of ['action', 'entityType', 'entityId', 'actorType', 'search', 'before']) {
    if (filters[key]) params.set(key, filters[key])
  }
  if (filters.entityIds?.length) params.set('entityIds', filters.entityIds.join(','))
  if (filters.limit) params.set('limit', String(filters.limit))

  const query = params.toString()
  const { entries, nextCursor } = await apiGet(`/api/audit${query ? `?${query}` : ''}`)
  return { entries: entries.map(normalizeAuditEntry), nextCursor }
}

export async function fetchAuditFacets() {
  return apiGet('/api/audit/facets')
}

/**
 * Entradas que corresponden a un atleta: las suyas propias más las de sus
 * afiliaciones, inscripciones y órdenes. `domain_audit_logs` guarda
 * `entity_id` como texto por entidad, así que la relación se arma acá con los
 * ids que el panel ya tiene cargados.
 */
export function relatedEntityIds({ athleteId, memberships = [], registrations = [], payments = [] }) {
  return [
    athleteId,
    ...memberships.map((item) => item.id),
    ...registrations.map((item) => item.id),
    ...payments.map((item) => item.id),
  ].filter(Boolean)
}
