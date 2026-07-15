import { describe, expect, it } from 'vitest'
import { createMemoryIntegrationEventStore } from '../server/modules/integrations/integrationEventStore.js'
import { createPaymentPreference, mapMercadoPagoStatus } from '../server/modules/payments/paymentWorkflow.js'
import { queueTransactionalEmail } from '../server/modules/notifications/notificationWorkflow.js'

describe('integration workflows', () => {
  it('registra preferencias de pago con idempotencia por clave de negocio', async () => {
    let order = {
      id: '8e9edb56-2dbf-45fb-9a79-60c31843f6df',
      athleteId: 'ath-001',
      amount: 38000,
      currency: 'ARS',
      displayConcept: 'Afiliacion PLU',
      method: 'mercado_pago',
      status: 'pendiente',
      payerEmail: 'martina@example.com',
    }
    const repository = {
      getOrder: async () => order,
      attachPreference: async (_id, preference, idempotencyKey) => {
        order = { ...order, preferenceId: preference.id, initPoint: preference.initPoint, idempotencyKey }
      },
    }
    let providerCalls = 0
    const mercadoPago = {
      createPreference: async () => {
        providerCalls += 1
        return { id: 'pref-1', initPoint: 'https://mercadopago.test/checkout', externalReference: order.id }
      },
    }

    const first = await createPaymentPreference({ paymentOrderId: order.id }, { repository, mercadoPago })
    const second = await createPaymentPreference({ paymentOrderId: order.id }, { repository, mercadoPago })

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.preference.id).toBe(first.preference.id)
    expect(providerCalls).toBe(1)
  })

  it('mapea estados externos sin permitir aprobaciones ambiguas', () => {
    expect(mapMercadoPagoStatus('approved')).toBe('aprobado')
    expect(mapMercadoPagoStatus('rejected')).toBe('rechazado')
    expect(mapMercadoPagoStatus('charged_back')).toBe('reembolsado')
    expect(mapMercadoPagoStatus('in_process')).toBe('pendiente')
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
