import { describe, expect, it } from 'vitest'
import { createMemoryIntegrationEventStore } from '../server/modules/integrations/integrationEventStore.js'
import { createPaymentPreference } from '../server/modules/payments/paymentWorkflow.js'
import { queueTransactionalEmail } from '../server/modules/notifications/notificationWorkflow.js'

describe('integration workflows', () => {
  it('registra preferencias de pago con idempotencia por clave de negocio', async () => {
    const eventStore = createMemoryIntegrationEventStore()
    const input = {
      amount: 78000,
      concept: 'Afiliacion anual + Pitbull Classic',
      athleteId: 'ath-001',
      idempotencyKey: 'order-ath-001-2026',
    }

    const first = await createPaymentPreference(input, { eventStore })
    const second = await createPaymentPreference(input, { eventStore })

    expect(first.paymentOrder.idempotencyKey).toBe('order-ath-001-2026')
    expect(second.integrationEvent.created).toBe(false)
    expect(second.paymentOrder.id).toBe(first.paymentOrder.id)
    expect(eventStore.list()).toHaveLength(1)
  })

  it('encola emails transaccionales sin duplicarlos ante retries', async () => {
    const eventStore = createMemoryIntegrationEventStore()
    const input = {
      to: 'martina.rivas@example.com',
      params: { name: 'Martina Rivas', amount: 78000 },
      entityType: 'payment',
      entityId: 'pay-001',
      idempotencyKey: 'email-payment-approved-pay-001',
    }

    const first = await queueTransactionalEmail('payment_approved', input, { eventStore })
    const retry = await queueTransactionalEmail('payment_approved', input, { eventStore })

    expect(first.emailLog.status).toBe('queued')
    expect(retry.integrationEvent.created).toBe(false)
    expect(retry.emailLog.id).toBe(first.emailLog.id)
    expect(eventStore.list()).toHaveLength(1)
  })
})
