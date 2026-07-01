import { randomUUID } from 'node:crypto'
import { integrationEventStore as defaultEventStore } from '../integrations/integrationEventStore.js'

function createLocalPaymentOrder(input, integrationEvent) {
  const orderId = `po-${randomUUID()}`

  return {
    id: orderId,
    athleteId: input.athleteId ?? null,
    orderType: input.orderType ?? 'membership_plus_event',
    status: 'pendiente',
    amount: input.amount,
    currency: input.currency ?? 'ARS',
    provider: 'mercado_pago',
    providerPreferenceId: `local-${orderId}`,
    providerInitPoint: null,
    externalRef: input.reference ?? orderId,
    idempotencyKey: input.idempotencyKey,
    concept: input.concept,
    integrationEventId: integrationEvent.id,
  }
}

export async function createPaymentPreference(input, options = {}) {
  const eventStore = options.eventStore ?? defaultEventStore
  const idempotencyKey = input.idempotencyKey ?? `payment-preference:${input.athleteId}:${input.concept}:${input.amount}`

  const integrationEvent = eventStore.record({
    provider: 'mercado_pago',
    type: 'payment.preference.requested',
    idempotencyKey,
    entityType: 'athlete',
    entityId: input.athleteId,
    payload: {
      amount: input.amount,
      currency: input.currency ?? 'ARS',
      concept: input.concept,
      orderType: input.orderType ?? 'membership_plus_event',
    },
  })

  if (!integrationEvent.created && integrationEvent.event.result?.paymentOrder) {
    return {
      paymentOrder: integrationEvent.event.result.paymentOrder,
      preference: integrationEvent.event.result.preference,
      integrationEvent,
    }
  }

  const paymentOrder = createLocalPaymentOrder({ ...input, idempotencyKey }, integrationEvent.event)
  const preference = {
    id: paymentOrder.providerPreferenceId,
    initPoint: paymentOrder.providerInitPoint,
    externalReference: paymentOrder.externalRef,
  }

  eventStore.markProcessed(integrationEvent.event.id, { paymentOrder, preference })

  return { paymentOrder, preference, integrationEvent }
}

export async function processPaymentWebhook(input, options = {}) {
  const eventStore = options.eventStore ?? defaultEventStore
  const externalId = input.externalId ?? input.data?.id ?? input.id ?? null
  const idempotencyKey = input.idempotencyKey ?? (externalId ? `mp-webhook:${externalId}` : null)

  const integrationEvent = eventStore.record({
    provider: 'mercado_pago',
    type: input.type ?? 'payment.webhook.received',
    externalId,
    idempotencyKey,
    entityType: 'payment',
    entityId: externalId,
    payload: input,
  })

  if (!integrationEvent.created && integrationEvent.event.result) {
    return { webhook: integrationEvent.event.result, integrationEvent }
  }

  const webhook = {
    externalId,
    status: input.status ?? 'received',
    processed: true,
  }

  eventStore.markProcessed(integrationEvent.event.id, webhook)
  return { webhook, integrationEvent }
}
