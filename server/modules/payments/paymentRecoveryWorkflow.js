import { logger } from '../../lib/logger.js'
import {
  PAYMENT_TRAIL_ACTIONS,
  paymentTrailMetadata,
  summarizeFailure,
} from './paymentAuditTrail.js'
import { mapMercadoPagoStatus, processClaimedPaymentEvent, applyCanonicalPayment } from './paymentWorkflow.js'

async function processInChunks(items, concurrency, worker) {
  const results = []
  for (let index = 0; index < items.length; index += concurrency) {
    const chunk = items.slice(index, index + concurrency)
    results.push(...await Promise.all(chunk.map(async (item) => {
      try {
        return { ok: true, value: await worker(item) }
      } catch (error) {
        // El id se conserva junto al motivo: sin esto el resumen decia
        // "failed: 3" y no habia forma de saber cuales ni por que.
        return { ok: false, id: item?.id ?? null, error: error?.message ?? String(error) }
      }
    })))
  }
  return results
}

export async function reconcileClaimedPaymentAttempt(attempt, options = {}) {
  const { repository, mercadoPago, notifyPaymentApplied, auditTrail } = options
  try {
    const order = await repository.getOrder(attempt.order_id)
    const payment = await mercadoPago.getPayment(attempt.external_payment_id)
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
        ...paymentTrailMetadata(payment),
      },
    })
    return applied.result
  } catch (error) {
    await repository.completeEmbeddedReconciliation(attempt.id, {
      succeeded: false,
      error: summarizeFailure(error, { stage: 'reconciliation' }),
    })
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

  const eventResults = await processInChunks(events, concurrency, (event) =>
    processClaimedPaymentEvent(event, { repository, mercadoPago, notifyPaymentApplied, auditTrail }))

  const reconciliationResults = await processInChunks(attempts, concurrency, (attempt) =>
    reconcileClaimedPaymentAttempt(attempt, { repository, mercadoPago, notifyPaymentApplied, auditTrail }))

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
