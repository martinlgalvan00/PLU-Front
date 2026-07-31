import { randomUUID } from 'node:crypto'
import { integrationEventStore as defaultEventStore } from '../integrations/integrationEventStore.js'
import { createEmailDispatcher, buildIdempotencyKey } from './emailDispatcher.js'

/**
 * notificationWorkflow.js — PLU ARG
 *
 * Compatibilidad hacia atrás. La lógica de envío real vive en
 * `emailDispatcher.js`; acá queda el encolado en memoria contra
 * `integrationEventStore`, que se sigue usando cuando no hay Supabase
 * disponible (tests de integración del webhook, scripts locales).
 *
 * Para código nuevo usar `createEmailDispatcher(...).send(type, input)`
 * directamente: valida contra el catálogo, respeta la lista de supresión y
 * programa reintentos, cosas que este camino en memoria no hace.
 */
export async function queueTransactionalEmail(type, input, options = {}) {
  if (options.repository) {
    const dispatcher = createEmailDispatcher({
      repository: options.repository,
      brevo: options.brevo,
      env: options.env ?? process.env,
    })
    const result = await dispatcher.send(type, input)
    return { emailLog: result.emailLog, created: result.created }
  }

  const eventStore = options.eventStore ?? defaultEventStore
  const idempotencyKey = input.idempotencyKey ?? buildIdempotencyKey(type, input)

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
