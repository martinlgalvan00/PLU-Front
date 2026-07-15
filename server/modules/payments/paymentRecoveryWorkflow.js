import { mapMercadoPagoStatus, processClaimedPaymentEvent, applyCanonicalPayment } from './paymentWorkflow.js'

async function processInChunks(items, concurrency, worker) {
  const results = []
  for (let index = 0; index < items.length; index += concurrency) {
    const chunk = items.slice(index, index + concurrency)
    results.push(...await Promise.all(chunk.map(async (item) => {
      try {
        return { ok: true, value: await worker(item) }
      } catch (error) {
        return { ok: false, error: error?.message ?? String(error) }
      }
    })))
  }
  return results
}

export async function reconcileClaimedPaymentAttempt(attempt, options = {}) {
  const { repository, mercadoPago, notifyPaymentApplied } = options
  try {
    const order = await repository.getOrder(attempt.order_id)
    const payment = await mercadoPago.getPayment(attempt.external_payment_id)
    const applied = await applyCanonicalPayment(payment, order, { repository, notifyPaymentApplied })
    const terminal = mapMercadoPagoStatus(payment.status) !== 'pendiente'
    await repository.completeEmbeddedReconciliation(attempt.id, { succeeded: true, terminal })
    return applied.result
  } catch (error) {
    await repository.completeEmbeddedReconciliation(attempt.id, {
      succeeded: false,
      error: error?.message ?? String(error),
    })
    throw error
  }
}

export async function recoverPaymentOperations(options = {}) {
  const {
    repository,
    mercadoPago,
    notifyPaymentApplied,
    eventLimit = 20,
    reconciliationLimit = 20,
    concurrency = 4,
  } = options

  const claims = await Promise.allSettled([
    repository.claimDueWebhookEvents(eventLimit),
    repository.claimEmbeddedReconciliations(reconciliationLimit),
  ])
  const events = claims[0].status === 'fulfilled' ? claims[0].value : []
  const attempts = claims[1].status === 'fulfilled' ? claims[1].value : []
  const claimErrors = claims
    .filter((claim) => claim.status === 'rejected')
    .map((claim) => claim.reason?.message ?? String(claim.reason))

  const eventResults = await processInChunks(events, concurrency, (event) =>
    processClaimedPaymentEvent(event, { repository, mercadoPago, notifyPaymentApplied }))

  const reconciliationResults = await processInChunks(attempts, concurrency, (attempt) =>
    reconcileClaimedPaymentAttempt(attempt, { repository, mercadoPago, notifyPaymentApplied }))

  return {
    claimErrors,
    events: {
      claimed: events.length,
      processed: eventResults.filter((item) => item.ok).length,
      failed: eventResults.filter((item) => !item.ok).length,
    },
    reconciliations: {
      claimed: attempts.length,
      processed: reconciliationResults.filter((item) => item.ok).length,
      failed: reconciliationResults.filter((item) => !item.ok).length,
    },
  }
}
