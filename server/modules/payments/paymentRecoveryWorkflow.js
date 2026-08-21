import { mapWithConcurrency } from '../../lib/concurrency.js'
import { HttpError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import {
  PAYMENT_TRAIL_ACTIONS,
  paymentTrailMetadata,
  summarizeFailure,
} from './paymentAuditTrail.js'
import {
  mapMercadoPagoStatus,
  processClaimedPaymentEvent,
  applyCanonicalPayment,
} from './paymentWorkflow.js'
import { selectCanonicalProviderPayment } from './providerPaymentSelection.js'
import { diagnosePaymentFailure } from './paymentFailureCatalog.js'

function isProviderPaymentNotFound(error) {
  if (Number(error?.provider?.apiResponseStatus) === 404) return true
  return /payment not found|resource not found|pago mock no encontrado/i.test(
    String(error?.message ?? ''),
  )
}

async function assertAttemptCollectorOwnership(attempt, mercadoPago) {
  const expectedCollectorId = String(attempt?.provider_payload?.collector_id ?? '').trim()
  if (!expectedCollectorId || typeof mercadoPago.getAccountIdentity !== 'function') return

  const account = await mercadoPago.getAccountIdentity()
  if (String(account?.id ?? '') === expectedCollectorId) return

  const error = new HttpError(
    409,
    'El intento fue creado por otra cuenta de Mercado Pago; este worker no puede conciliarlo.',
    { code: 'MP_ACCOUNT_MISMATCH' },
  )
  error.provider = {
    code: 'MP_ACCOUNT_MISMATCH',
    expectedCollectorId,
    currentCollectorId: String(account?.id ?? ''),
    apiResponseStatus: null,
  }
  throw error
}

/**
 * Un intento del Brick ya tiene evidencia local de que Payment.create devolvio
 * un recurso. Si el GET directo pasa a responder 404, no alcanza con asumir
 * que el pago nunca existio: primero se reconstruye la verdad de la orden por
 * external_reference. Esto tambien cubre un segundo intento valido para la
 * misma orden sin acreditar a ciegas: applyCanonicalPayment vuelve a validar
 * referencia, monto y moneda antes de tocar el dominio.
 */
async function resolveAttemptPayment(attempt, order, mercadoPago) {
  // Payment.create persiste collector_id junto al intento. Compararlo antes
  // del GET evita convertir una mezcla de entornos en un 404 enganoso.
  await assertAttemptCollectorOwnership(attempt, mercadoPago)
  try {
    return {
      payment: await mercadoPago.getPayment(attempt.external_payment_id),
      source: 'payment_id',
    }
  } catch (error) {
    if (
      !isProviderPaymentNotFound(error) ||
      typeof mercadoPago.searchPaymentsForOrder !== 'function'
    ) {
      throw error
    }

    let candidates
    try {
      candidates = await mercadoPago.searchPaymentsForOrder(order)
    } catch {
      // Se conserva el 404 original: es el dato que explica por que comenzo la
      // recuperacion y evita reemplazarlo por una falla secundaria de search.
      throw error
    }
    const canonical = selectCanonicalProviderPayment(candidates)
    if (!canonical) throw error
    return { payment: canonical, source: 'external_reference' }
  }
}

/**
 * `mapWithConcurrency` ya aisla el fallo de cada item (no corta el lote); acá
 * solo se recupera el `id` original -- el motivo por el que antes se
 * reimplementaba el loop a mano -- y se lo re-empareja con el resultado por
 * indice, que `mapWithConcurrency` conserva.
 */
function summarizeConcurrentResults(items, results) {
  return results.map((result, index) => {
    if (result.status === 'fulfilled') return { ok: true, value: result.value }
    // El id se conserva junto al motivo: sin esto el resumen decia
    // "failed: 3" y no habia forma de saber cuales ni por que.
    return {
      ok: false,
      id: items[index]?.id ?? null,
      error: result.reason?.message ?? String(result.reason),
    }
  })
}

export async function reconcileClaimedPaymentAttempt(attempt, options = {}) {
  const { repository, mercadoPago, notifyPaymentApplied, auditTrail } = options
  try {
    const order = await repository.getOrder(attempt.order_id)
    const resolved = await resolveAttemptPayment(attempt, order, mercadoPago)
    const payment = resolved.payment
    const applied = await applyCanonicalPayment(payment, order, {
      repository,
      notifyPaymentApplied,
      auditTrail,
      stage: 'reconciliation',
    })
    const terminal = mapMercadoPagoStatus(payment.status) !== 'pendiente'
    await repository.completeEmbeddedReconciliation(attempt.id, { succeeded: true, terminal })
    await auditTrail?.record({
      action: PAYMENT_TRAIL_ACTIONS.reconciled,
      order,
      status: mapMercadoPagoStatus(payment.status),
      severity: terminal ? 'success' : 'info',
      externalPaymentId: payment.id,
      metadata: {
        stage: 'reconciliation',
        attemptId: attempt.id,
        terminal,
        recoverySource: resolved.source,
        originalExternalPaymentId: String(attempt.external_payment_id),
        ...paymentTrailMetadata(payment),
      },
    })
    return applied.result
  } catch (error) {
    const persistedError = summarizeFailure(error, { stage: 'reconciliation' })
    const diagnosis = diagnosePaymentFailure(error)

    // Un 404 definitivo o una cuenta cobradora distinta no mejoran con el
    // backoff. Dejarlos en el worker genera la misma alerta una y otra vez y
    // no acerca el pago a una conciliacion. Quedan preservados como evidencia
    // y requieren una intervencion explicita despues de corregir el entorno.
    if (diagnosis.retryable === false && typeof repository.stopEmbeddedReconciliation === 'function') {
      await repository.stopEmbeddedReconciliation(attempt.id, { error: persistedError })
    } else {
      await repository.completeEmbeddedReconciliation(attempt.id, {
        succeeded: false,
        error: persistedError,
      })
    }
    await auditTrail?.recordFailure({
      action: PAYMENT_TRAIL_ACTIONS.reconciliationFailed,
      stage: 'reconciliation',
      entityType: attempt.order_kind === 'ticket' ? 'ticket_order' : 'athlete_payment_order',
      entityId: attempt.order_id,
      externalPaymentId: attempt.external_payment_id,
      error,
      metadata: {
        attemptId: attempt.id,
        reconciliationAttempts: attempt.reconciliation_attempts ?? null,
      },
    })
    throw error
  }
}

export async function recoverPaymentOperations(options = {}) {
  const {
    repository,
    mercadoPago,
    notifyPaymentApplied,
    auditTrail,
    eventLimit = 20,
    reconciliationLimit = 20,
    concurrency = 4,
  } = options

  const startedAt = Date.now()
  const claims = await Promise.allSettled([
    repository.claimDueWebhookEvents(eventLimit),
    repository.claimEmbeddedReconciliations(reconciliationLimit),
  ])
  const events = claims[0].status === 'fulfilled' ? claims[0].value : []
  const attempts = claims[1].status === 'fulfilled' ? claims[1].value : []
  const claimErrors = claims
    .filter((claim) => claim.status === 'rejected')
    .map((claim) => claim.reason?.message ?? String(claim.reason))

  for (const claim of claims) {
    if (claim.status === 'rejected') {
      logger.error('payment.recovery_claim_failed', { err: claim.reason })
    }
  }

  const eventResults = summarizeConcurrentResults(
    events,
    await mapWithConcurrency(events, concurrency, (event) =>
      processClaimedPaymentEvent(event, {
        repository,
        mercadoPago,
        notifyPaymentApplied,
        auditTrail,
      }),
    ),
  )

  const reconciliationResults = summarizeConcurrentResults(
    attempts,
    await mapWithConcurrency(attempts, concurrency, (attempt) =>
      reconcileClaimedPaymentAttempt(attempt, {
        repository,
        mercadoPago,
        notifyPaymentApplied,
        auditTrail,
      }),
    ),
  )

  const summary = {
    claimErrors,
    events: {
      claimed: events.length,
      processed: eventResults.filter((item) => item.ok).length,
      failed: eventResults.filter((item) => !item.ok).length,
      // Lo que fallo, con su motivo. Es la diferencia entre "reintentar a
      // ciegas" y saber si son todos el mismo problema de configuracion.
      failures: eventResults.filter((item) => !item.ok).map(({ id, error }) => ({ id, error })),
    },
    reconciliations: {
      claimed: attempts.length,
      processed: reconciliationResults.filter((item) => item.ok).length,
      failed: reconciliationResults.filter((item) => !item.ok).length,
      failures: reconciliationResults
        .filter((item) => !item.ok)
        .map(({ id, error }) => ({ id, error })),
    },
    durationMs: Date.now() - startedAt,
  }

  if (summary.events.claimed || summary.reconciliations.claimed || claimErrors.length) {
    logger.info(PAYMENT_TRAIL_ACTIONS.recoveryRun, summary)
    await auditTrail?.record({
      action: PAYMENT_TRAIL_ACTIONS.recoveryRun,
      entityType: 'payment_recovery',
      entityId: 'payment_recovery',
      status: summary.events.failed || summary.reconciliations.failed ? 'partial' : 'processed',
      severity: summary.events.failed || summary.reconciliations.failed ? 'warning' : 'info',
      metadata: summary,
    })
  }

  return summary
}
