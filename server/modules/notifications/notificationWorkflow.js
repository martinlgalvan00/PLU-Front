import { randomUUID } from 'node:crypto'
import { integrationEventStore as defaultEventStore } from '../integrations/integrationEventStore.js'

export async function queueTransactionalEmail(type, input, options = {}) {
  if (options.repository) {
    const idempotencyKey =
      input.idempotencyKey ?? `email:${type}:${input.entityType ?? 'none'}:${input.entityId ?? input.to}`
    const started = await options.repository.beginEmail({
      ...input,
      type,
      idempotencyKey,
    })
    if (!started.created) return { emailLog: started.emailLog, created: false }

    if (!options.brevo?.configured || !input.templateId) {
      const emailLog = await options.repository.completeEmail(started.emailLog.id, { status: 'skipped' })
      return { emailLog, created: true }
    }

    try {
      const response = await options.brevo.sendTemplate({
        to: input.to,
        templateId: input.templateId,
        params: input.params,
      })
      const emailLog = await options.repository.completeEmail(started.emailLog.id, {
        status: 'sent',
        response,
      })
      return { emailLog, created: true }
    } catch (error) {
      await options.repository.completeEmail(started.emailLog.id, {
        status: 'failed',
        error: error?.message ?? String(error),
      })
      throw error
    }
  }

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
