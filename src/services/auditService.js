import { apiGet } from '../lib/api.js'

/**
 * auditService.js — PLU ARG
 *
 * Bitácora real del sistema. Hasta ahora el panel mostraba un historial que se
 * construía en el browser y se guardaba en localStorage: distinto para cada
 * operador, perdido al limpiar el navegador y sin relación con lo que había
 * pasado de verdad. Acá se lee `operational_audit_events`, que unifica los
 * efectos transaccionales de dominio con las transiciones append-only de
 * emails, webhooks y pagos.
 *
 * El servicio no traduce: devuelve la clave de acción y el componente resuelve
 * la etiqueta con i18n. Así una acción nueva en una RPC aparece igual en el
 * panel aunque todavía no tenga copy, en vez de desaparecer del listado.
 */

/** Tono de la fila: severidad operativa, no decoración. */
const ACTION_TONES = {
  'account.created': 'success',
  'account.reactivated': 'success',
  'auth.login_succeeded': 'success',
  'auth.login_failed': 'warning',
  'auth.session_started': 'success',
  'auth.session_ended': 'info',
  'payment.applied': 'success',
  'payment.aprobado': 'success',
  'payment.rechazado': 'danger',
  'payment.reembolsado': 'danger',
  'payment.cancelado': 'warning',
  'payment.pendiente': 'info',
  'payment_brick.error': 'danger',
  'payment.approved_manually': 'success',
  'payment.rejected_manually': 'danger',
  'payment.proof_uploaded': 'info',
  'membership.activated': 'success',
  'membership.activated_manually': 'success',
  'membership.cancelled_manually': 'danger',
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
  'ticket_order.rejected': 'danger',
  'ticket.checked_in': 'success',
  'ticket_addon.redeemed': 'info',
  'event.upserted': 'info',
  'email.sent': 'success',
  'email.delivered': 'success',
  'email.retrying': 'warning',
  'email.suppressed': 'warning',
  'email.failed': 'danger',
  'email.rejected': 'danger',
  'email.bounced': 'danger',
  'email.skipped': 'danger',
  'payment_webhook.processed': 'success',
  'payment_webhook.failed': 'danger',
  'payment_attempt.failed': 'danger',
  'payment_reconciliation.failed': 'danger',
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
  'templateKey',
  'recipientEmail',
  'attempt',
  'errorCode',
  'error',
  'nextRetryAt',
  'providerMessageId',
  'resourceId',
  'reconciliationStatus',
  'payerEmail',
  'statusDetail',
  'method',
  'reason',
  'roleKey',
  'accountKind',
  'ledger',
  'paymentRecordId',
]

export function auditActionTone(action) {
  return ACTION_TONES[action] ?? 'default'
}

/**
 * `paymentAuditTrail.recordFailure` guarda `metadata.error` como objeto
 * ({message, code, stack, origin, cause}), no como string: la traza completa
 * vive en `PaymentTraceDialog` vía `/api/payments/audit/orders/:id`. Acá solo
 * necesitamos el mensaje para el resumen de la fila — pasar el objeto crudo
 * lo convierte en "[object Object]" al mostrarse.
 */
function summaryValue(value) {
  if (value !== null && typeof value === 'object') {
    return typeof value.message === 'string' && value.message ? value.message : null
  }
  return value
}

function summarize(metadata) {
  if (!metadata || typeof metadata !== 'object') return []
  return SUMMARY_FIELDS.map((field) => ({ field, value: summaryValue(metadata[field]) })).filter(
    ({ value }) => value != null && value !== '',
  )
}

export function normalizeAuditEntry(row) {
  return {
    id: row.id,
    source: row.source ?? 'domain',
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actorType: row.actor_type,
    actorId: row.actor_id ?? null,
    status: row.status ?? null,
    severity: row.severity ?? null,
    metadata: row.metadata ?? {},
    summary: summarize(row.metadata),
    tone: row.severity ?? auditActionTone(row.action),
    createdAt: row.created_at,
  }
}

export async function fetchAuditEntries(filters = {}) {
  const params = new URLSearchParams()
  for (const key of ['action', 'entityType', 'entityId', 'actorType', 'source', 'status', 'search', 'before', 'beforeId']) {
    if (filters[key]) params.set(key, filters[key])
  }
  if (filters.entityIds?.length) params.set('entityIds', filters.entityIds.join(','))
  if (filters.limit) params.set('limit', String(filters.limit))

  const query = params.toString()
  const { entries, nextCursor, nextCursorId } = await apiGet(
    `/api/audit${query ? `?${query}` : ''}`,
  )
  return {
    entries: entries.map(normalizeAuditEntry),
    nextCursor,
    // Cursor compuesto: `created_at` solo no desempata filas del mismo
    // instante y la página siguiente las saltearía.
    nextCursorId,
  }
}

export async function fetchAuditFacets() {
  return apiGet('/api/audit/facets')
}

export async function fetchAuditOverview() {
  return apiGet('/api/audit/overview')
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
