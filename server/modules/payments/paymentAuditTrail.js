import { PRIMARY_ORGANIZATION_ID } from '../../lib/organizations.js'
import {
  getBreadcrumbs,
  getRequestContext,
  getRequestId,
  logger,
  maskEmail,
  originFrame,
  serializeError,
} from '../../lib/logger.js'
import { diagnosePaymentFailure, explainPaymentStatusDetail } from './paymentFailureCatalog.js'

/**
 * paymentAuditTrail.js — PLU ARG
 *
 * Bitacora del ciclo de cobro, etapa por etapa. Hasta ahora solo quedaba
 * rastro de dos extremos: el webhook crudo en `payment_integration_events` y
 * el asiento final en `athlete_payments` (via trigger). Todo lo del medio
 * -- preferencia creada, intento embebido reclamado, submit al proveedor,
 * conciliacion -- no dejaba nada, asi que un pago que nunca llego a
 * acreditarse era invisible hasta que el socio reclamaba.
 *
 * Cada asiento va a `operational_event_logs` (append-only, ya expuesto en
 * Panel > Auditoria) y ademas al log estructurado, para que la traza
 * sobreviva aunque sea Supabase lo que este caido.
 *
 * Invariantes:
 * - Es best-effort: nunca lanza. Un problema de observabilidad no puede
 *   revertir ni frenar un cobro.
 * - Nunca recibe tokens de tarjeta ni secretos. El email se guarda enmascarado.
 * - Toda falla guarda `diagnosis` (codigo + como resolverlo) y `stack`.
 */

const MAX_STACK = 4_000
/** Marca no enumerable: evita asentar dos veces la misma falla. */
const AUDITED = Symbol.for('plu.payment.audited')

export const PAYMENT_TRAIL_ACTIONS = {
  preferenceCreated: 'payment.preference_created',
  preferenceReused: 'payment.preference_reused',
  attemptClaimed: 'payment.attempt_claimed',
  providerSubmitted: 'payment.provider_submitted',
  applied: 'payment.applied',
  duplicate: 'payment.duplicate_submit',
  failed: 'payment.failed',
  webhookReceived: 'payment.webhook_received',
  webhookProcessed: 'payment.webhook_processed',
  webhookFailed: 'payment.webhook_failed',
  manualRejection: 'payment.manual_rejection',
  forceSettled: 'payment.force_settled',
  reconciled: 'payment.reconciled',
  // Revalidacion contra el proveedor: releer que dice Mercado Pago de una orden
  // y corregir el estado local con esa respuesta.
  revalidated: 'payment.revalidated',
  revalidationMismatch: 'payment.revalidation_mismatch',
  revalidationSweep: 'payment.revalidation_sweep',
  reconciliationFailed: 'payment.reconciliation_failed',
  recoveryRun: 'payment.recovery_run',
  orderCreated: 'payment.order_created',
}

function entityTypeFor(order) {
  return order?.kind === 'ticket' ? 'ticket_order' : 'athlete_payment_order'
}

function actorTypeFor(order) {
  if (!order) return 'system'
  return order.kind === 'ticket' ? 'buyer' : 'athlete'
}

function stackOf(error) {
  const stack = typeof error?.stack === 'string' ? error.stack : null
  if (!stack) return null
  return stack.length > MAX_STACK ? `${stack.slice(0, MAX_STACK)}…[truncated]` : stack
}

/**
 * Resumen de una linea para la columna `error` de las tablas de integracion
 * (limitada a 2000 chars). Lleva el codigo de diagnostico y el requestId al
 * frente para que el panel muestre algo accionable sin abrir los logs.
 */
export function summarizeFailure(error, { stage } = {}) {
  const diagnosis = diagnosePaymentFailure(error)
  const message = error?.message ?? String(error)
  const requestId = getRequestId()
  return [
    `[${diagnosis.code}]`,
    stage ? `${stage}:` : null,
    message,
    requestId ? `(requestId=${requestId})` : null,
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 1_900)
}

function noopTrail() {
  return {
    enabled: false,
    async record() { return false },
    async recordFailure() { return false },
  }
}

export function createPaymentAuditTrail({
  client,
  organizationId = PRIMARY_ORGANIZATION_ID,
} = {}) {
  if (!client || typeof client.from !== 'function') return noopTrail()

  async function insert(row) {
    try {
      const result = await client.from('operational_event_logs').insert(row)
      if (result?.error) throw result.error
      return true
    } catch (auditError) {
      // Se degrada al log del proceso: preferimos perder el asiento en la base
      // antes que romper el cobro que lo genero.
      logger.warn('payment.audit_write_failed', {
        action: row.action,
        entityId: row.entity_id,
        err: auditError,
      })
      return false
    }
  }

  return {
    enabled: true,

    /**
     * Asiento de una etapa exitosa o informativa del ciclo de cobro.
     */
    async record({
      action,
      order = null,
      entityType,
      entityId,
      status = null,
      severity = 'info',
      externalPaymentId = null,
      metadata = {},
    }) {
      const requestId = getRequestId()
      const payload = {
        organization_id: order?.organizationId ?? organizationId,
        source: 'payment',
        action: String(action).slice(0, 80),
        entity_type: String(entityType ?? entityTypeFor(order)).slice(0, 60),
        entity_id: String(entityId ?? order?.id ?? 'unknown').slice(0, 160),
        actor_type: actorTypeFor(order),
        actor_id: order?.athleteId ?? externalPaymentId ?? null,
        status: status ? String(status).slice(0, 40) : null,
        severity,
        metadata: {
          ...metadata,
          ...(requestId ? { requestId } : {}),
          ...(order
            ? {
                orderKind: order.kind,
                concept: order.concept ?? null,
                amount: order.amount ?? null,
                currency: order.currency ?? null,
                reference: order.reference ?? null,
                payerEmail: order.payerEmail ? maskEmail(order.payerEmail) : null,
              }
            : {}),
          ...(externalPaymentId ? { externalPaymentId: String(externalPaymentId) } : {}),
        },
      }

      logger.info(action, {
        orderId: payload.entity_id,
        status: payload.status,
        ...metadata,
      })
      return insert(payload)
    },

    /**
     * Asiento de falla: guarda stack completo y el diagnostico accionable.
     * Es la pieza que responde "que fallo y como se arregla" sin reproducir.
     */
    async recordFailure({
      action = PAYMENT_TRAIL_ACTIONS.failed,
      stage,
      order = null,
      entityType,
      entityId,
      externalPaymentId = null,
      error,
      metadata = {},
    }) {
      // Una misma falla atraviesa varias capas (aplicacion canonica ->
      // checkout embebido -> ruta). Se audita en la primera que la ve, con su
      // etapa real; las de arriba no vuelven a asentarla.
      if (error && typeof error === 'object') {
        if (error[AUDITED]) return false
        try {
          Object.defineProperty(error, AUDITED, { value: true, enumerable: false })
        } catch {
          // Errores congelados: se audita igual, a lo sumo queda duplicado.
        }
      }

      const diagnosis = diagnosePaymentFailure(error)
      const requestId = getRequestId()

      logger.error(action, {
        stage,
        // Puede no ser una orden: en el intake del webhook es el data.id de la
        // notificacion, que todavia no se resolvio contra ninguna orden.
        entityId: entityId ?? order?.id ?? null,
        orderId: order?.id ?? null,
        externalPaymentId,
        err: error,
        diagnosis: {
          code: diagnosis.code,
          title: diagnosis.title,
          severity: diagnosis.severity,
          scope: diagnosis.scope,
          cause: diagnosis.cause,
          fix: diagnosis.fix,
          retryable: diagnosis.retryable,
        },
        ...metadata,
      })

      return insert({
        organization_id: order?.organizationId ?? organizationId,
        source: 'payment',
        action: String(action).slice(0, 80),
        entity_type: String(entityType ?? entityTypeFor(order)).slice(0, 60),
        entity_id: String(entityId ?? order?.id ?? 'unknown').slice(0, 160),
        actor_type: actorTypeFor(order),
        actor_id: order?.athleteId ?? externalPaymentId ?? null,
        status: 'failed',
        severity: diagnosis.severity === 'expected' ? 'warning' : 'danger',
        metadata: {
          ...metadata,
          stage: stage ?? null,
          ...(requestId ? { requestId } : {}),
          // Mismo contexto de orden que los asientos exitosos: al reconstruir
          // un incidente hace falta saber cuanta plata y de quien era.
          ...(order
            ? {
                orderKind: order.kind,
                concept: order.concept ?? null,
                amount: order.amount ?? null,
                currency: order.currency ?? null,
                reference: order.reference ?? null,
                payerEmail: order.payerEmail ? maskEmail(order.payerEmail) : null,
              }
            : {}),
          ...(externalPaymentId ? { externalPaymentId: String(externalPaymentId) } : {}),
          // Por donde entro la operacion: checkout del atleta, webhook de MP,
          // job de recuperacion o reintento manual del panel.
          entrypoint: getRequestContext()?.entrypoint ?? null,
          error: {
            message: error?.message ?? String(error),
            name: error?.name ?? 'Error',
            status: error?.status ?? null,
            code: error?.details?.code ?? error?.code ?? null,
            provider: error?.provider ?? null,
            // Archivo y linea de codigo propio donde se rompio.
            origin: originFrame(error),
            stack: stackOf(error),
            cause: error?.cause ? serializeError(error.cause, 3) : null,
          },
          // Que venia pasando antes de la falla, con el tiempo de cada paso.
          trail: getBreadcrumbs().slice(-20),
          diagnosis,
        },
      })
    },
  }
}

/**
 * Metadata comun de un pago del proveedor, ya sin datos sensibles. Se usa en
 * los asientos de aplicacion y conciliacion.
 */
export function paymentTrailMetadata(payment) {
  const statusDetail = payment?.status_detail ?? payment?.statusDetail ?? null
  return {
    providerStatus: payment?.status ?? null,
    statusDetail,
    statusDetailMeaning: explainPaymentStatusDetail(statusDetail),
    paymentMethodId: payment?.payment_method_id ?? null,
    paymentTypeId: payment?.payment_type_id ?? null,
    installments: payment?.installments ?? null,
  }
}
