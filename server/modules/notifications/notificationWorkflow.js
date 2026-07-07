import { randomUUID } from 'node:crypto'
import { integrationEventStore as defaultEventStore } from '../integrations/integrationEventStore.js'

export async function queueTransactionalEmail(type, input, options = {}) {
  const eventStore = options.eventStore ?? defaultEventStore
  const idempotencyKey =
    input.idempotencyKey ?? `email:${type}:${input.entityType ?? 'none'}:${input.entityId ?? input.to}`

  const integrationEvent = eventStore.record({
    provider: 'brevo',
    type: `email.${type}.requested`,
    idempotencyKey,
    entityType: input.entityType,
    entityId: input.entityId,
    payload: {
      type,
      to: input.to,
      params: input.params ?? {},
      templateId: input.templateId ?? null,
    },
  })

  if (!integrationEvent.created && integrationEvent.event.result?.emailLog) {
    return { emailLog: integrationEvent.event.result.emailLog, integrationEvent }
  }

  const now = new Date().toISOString()
  const emailLog = {
    id: `email-${randomUUID()}`,
    provider: 'brevo',
    templateKey: type,
    recipientEmail: input.to,
    status: options.sendImmediately ? 'sent' : 'queued',
    payload: input.params ?? {},
    providerResponse: null,
    error: null,
    sentAt: options.sendImmediately ? now : null,
    createdAt: now,
    integrationEventId: integrationEvent.event.id,
  }

  eventStore.markProcessed(integrationEvent.event.id, { emailLog })
  return { emailLog, integrationEvent }
}
