import { randomUUID } from 'node:crypto'

function eventKey(event) {
  if (event.idempotencyKey) return `idempotency:${event.idempotencyKey}`
  if (event.externalId) return `external:${event.provider}:${event.externalId}`
  return null
}

export function createMemoryIntegrationEventStore() {
  const events = []
  const byKey = new Map()

  return {
    record(eventInput) {
      const key = eventKey(eventInput)
      if (key && byKey.has(key)) {
        return { event: byKey.get(key), created: false }
      }

      const now = new Date().toISOString()
      const event = {
        id: eventInput.id ?? `int-${randomUUID()}`,
        provider: eventInput.provider,
        type: eventInput.type,
        status: eventInput.status ?? 'received',
        externalId: eventInput.externalId ?? null,
        idempotencyKey: eventInput.idempotencyKey ?? null,
        entityType: eventInput.entityType ?? null,
        entityId: eventInput.entityId ?? null,
        payload: eventInput.payload ?? null,
        result: eventInput.result ?? null,
        error: null,
        attemptsCount: 0,
        receivedAt: now,
        processedAt: null,
        createdAt: now,
        updatedAt: now,
      }

      events.push(event)
      if (key) byKey.set(key, event)
      return { event, created: true }
    },

    markProcessed(eventId, result = null) {
      const event = events.find((item) => item.id === eventId)
      if (!event) return null

      event.status = 'processed'
      event.result = result
      event.processedAt = new Date().toISOString()
      event.updatedAt = event.processedAt
      return event
    },

    markFailed(eventId, error) {
      const event = events.find((item) => item.id === eventId)
      if (!event) return null

      event.status = 'failed'
      event.error = error?.message ?? String(error)
      event.updatedAt = new Date().toISOString()
      return event
    },

    list() {
      return [...events]
    },

    clear() {
      events.length = 0
      byKey.clear()
    },
  }
}

export const integrationEventStore = createMemoryIntegrationEventStore()
