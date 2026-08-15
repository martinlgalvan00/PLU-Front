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
  // Brevo puede rechazar/suprimir un destinatario sin que se caiga el flujo
  // principal. Se conserva para seguimiento, pero no como incidente crítico.
  'email.rejected': 'warning',
  'email.bounced': 'warning',
  'email.skipped': 'warning',
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

// Estas fallas se rechazan antes de acreditar o alterar la orden. Las filas
// históricas se guardaron como `danger`, por lo que el tono se recalcula al
// leerlas a partir de su diagnóstico para no conservar ese falso crítico.
const CONTAINED_PAYMENT_FAILURE_CODES = new Set([
  'MP_WEBHOOK_SIGNATURE_INVALID',
  'ORDER_AMOUNT_MISMATCH',
  'ORDER_PAYMENT_MISMATCH',
  'ORDER_NOT_PAYABLE',
])

const CONTAINED_PAYMENT_REASONS = new Set(['signature_rejected'])

function paymentFailureCode(metadata) {
  const directCode = metadata?.diagnosis?.code ?? metadata?.errorCode ?? metadata?.error?.code
  if (typeof directCode === 'string' && directCode) return directCode

  const message = typeof metadata?.error === 'string'
    ? metadata.error
    : metadata?.error?.message
  const match = typeof message === 'string' ? message.match(/\[([A-Z_]+)\]/) : null
  return match?.[1] ?? null
}

export function auditEntryTone({ action, severity, metadata }) {
  const diagnosisSeverity = metadata?.diagnosis?.severity
  if (diagnosisSeverity === 'blocker') return 'danger'
  if (diagnosisSeverity === 'degraded' || diagnosisSeverity === 'expected') return 'warning'

  if (
    CONTAINED_PAYMENT_FAILURE_CODES.has(paymentFailureCode(metadata))
    || CONTAINED_PAYMENT_REASONS.has(metadata?.reason)
  ) {
    return 'warning'
  }

  return severity ?? auditActionTone(action)
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

/**
 * Campos de metadata que ya no hace falta repetir en el volcado crudo del
 * detalle: `describeAuditError` los sube a bloques con nombre propio.
 */
const ERROR_METADATA_FIELDS = new Set([
  'error', 'diagnosis', 'reason', 'statusDetail', 'errorCode', 'stage', 'entrypoint', 'requestId',
])

/**
 * Cadena de causas de un error, de la más externa a la más profunda.
 *
 * Un `HttpError: no se pudo cobrar` con `cause` de red es dos hechos distintos:
 * el que ve la persona y el que hay que arreglar. Aplanarlos a un solo mensaje
 * pierde justo el segundo.
 */
function causeChain(error, depth = 0) {
  // Tope de profundidad: una cadena circular colgaría el render del panel.
  if (!error || typeof error !== 'object' || depth > 5) return []
  const current = {
    name: typeof error.name === 'string' ? error.name : null,
    message: typeof error.message === 'string' ? error.message : null,
    code: error.code ?? null,
    stack: typeof error.stack === 'string' ? error.stack : null,
  }
  const rest = error.cause ? causeChain(error.cause, depth + 1) : []
  return current.message || current.stack ? [current, ...rest] : rest
}

/**
 * Diagnóstico de `paymentFailureCatalog.js`. No es texto: trae título, causa en
 * castellano, pasos concretos de arreglo, alcance y si conviene reintentar.
 *
 * Aplastarlo con `String(...)` daba "[object Object]" — justamente el campo que
 * contesta "por qué falló" y "qué hago con esto" quedaba ilegible.
 */
function normalizeDiagnosis(value) {
  if (!value) return null
  if (typeof value === 'string') return { title: null, cause: value, fix: [], code: null }
  if (typeof value !== 'object') return null
  return {
    title: typeof value.title === 'string' ? value.title : null,
    cause: typeof value.cause === 'string' ? value.cause : null,
    fix: Array.isArray(value.fix) ? value.fix.filter((step) => typeof step === 'string') : [],
    code: value.code ?? null,
    scope: value.scope ?? null,
    severity: value.severity ?? null,
    // `false` es información y no ausencia: dice que reintentar no sirve.
    retryable: typeof value.retryable === 'boolean' ? value.retryable : null,
  }
}

/**
 * Todo lo que hace falta para diagnosticar una falla, sacado de la metadata.
 *
 * El backend ya venía guardando código, status HTTP, archivo y línea de origen,
 * stack completo y cadena de causas; la fila de la tabla se quedaba con
 * `error.message` y el resto no se podía ver desde ningún lado.
 */
export function describeAuditError(metadata) {
  if (!metadata || typeof metadata !== 'object') return null

  const raw = metadata.error
  const error = raw !== null && typeof raw === 'object' ? raw : null
  // `email.bounced` guarda `error` como texto plano, no como objeto.
  const message = error
    ? (typeof error.message === 'string' ? error.message : null)
    : (typeof raw === 'string' && raw.trim() ? raw.trim() : null)

  const origin = error?.origin && typeof error.origin === 'object' ? error.origin : null
  const chain = causeChain(error?.cause)
  const diagnosis = normalizeDiagnosis(metadata.diagnosis)

  const detail = {
    message,
    name: error?.name ?? null,
    code: error?.code ?? metadata.errorCode ?? null,
    httpStatus: Number.isFinite(Number(error?.status)) ? Number(error.status) : null,
    provider: error?.provider ?? null,
    stack: typeof error?.stack === 'string' ? error.stack : null,
    origin: origin
      ? {
        file: origin.file ?? null,
        line: origin.line ?? null,
        column: origin.column ?? null,
        function: origin.function ?? null,
      }
      : null,
    causes: chain,
    // Por qué falló, en el lenguaje del negocio y no del stack.
    diagnosis,
    reason: metadata.reason ?? null,
    statusDetail: metadata.statusDetail ?? null,
    stage: metadata.stage ?? null,
    entrypoint: metadata.entrypoint ?? null,
    requestId: metadata.requestId ?? null,
  }

  const hasSomething = Object.entries(detail).some(([key, value]) =>
    key === 'causes' ? value.length > 0 : value != null && value !== '')
  return hasSomething ? detail : null
}

/** Metadata que no quedó cubierta por los bloques con nombre propio. */
export function residualMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return {}
  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !ERROR_METADATA_FIELDS.has(key)),
  )
}

export function normalizeAuditEntry(row) {
  const metadata = row.metadata ?? {}
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
    metadata,
    summary: summarize(metadata),
    errorDetail: describeAuditError(metadata),
    tone: auditEntryTone({ action: row.action, severity: row.severity, metadata }),
    createdAt: row.created_at,
  }
}

/**
 * Evento completo con lo que pasó alrededor: la misma llamada HTTP, lo que la
 * persona venía haciendo antes, lo que hizo después y la historia de la entidad.
 */
export async function fetchAuditEventContext(id) {
  const { event, context } = await apiGet(`/api/audit/${encodeURIComponent(id)}/context`)
  const list = (rows) => (Array.isArray(rows) ? rows.map(normalizeAuditEntry) : [])
  return {
    event: normalizeAuditEntry(event),
    context: {
      request: list(context?.request),
      actorBefore: list(context?.actorBefore),
      actorAfter: list(context?.actorAfter),
      entity: list(context?.entity),
    },
  }
}

export async function fetchAuditEntries(filters = {}) {
  const params = new URLSearchParams()
  for (const key of ['action', 'category', 'entityType', 'entityId', 'actorType', 'source', 'status', 'search', 'before', 'beforeId']) {
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
