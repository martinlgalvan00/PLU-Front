import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryIntegrationEventStore } from '../server/modules/integrations/integrationEventStore.js'
import {
  createPaymentPreference,
  mapMercadoPagoStatus,
  processPaymentWebhook,
} from '../server/modules/payments/paymentWorkflow.js'
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
    expect(mapMercadoPagoStatus('cancelled')).toBe('cancelado')
    expect(mapMercadoPagoStatus('refunded')).toBe('reembolsado')
    expect(mapMercadoPagoStatus('charged_back')).toBe('reembolsado')
    expect(mapMercadoPagoStatus('in_process')).toBe('pendiente')
    expect(mapMercadoPagoStatus('pending')).toBe('pendiente')
    expect(mapMercadoPagoStatus('unknown_provider_status')).toBe('pendiente')
  })

  it('confirma el webhook apenas queda en la bandeja durable cuando el worker esta activo', async () => {
    const secret = 'webhook-secret-for-tests'
    const requestId = 'request-deferred-1'
    const dataId = 'payment-deferred-1'
    const ts = Date.now()
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
    const hash = createHmac('sha256', secret).update(manifest).digest('hex')
    const event = { id: 'event-1', status: 'received' }
    const repository = {
      recordWebhook: vi.fn(async () => ({ event, created: true })),
      claimWebhookEvent: vi.fn(),
    }
    const mercadoPago = { getPayment: vi.fn() }

    const result = await processPaymentWebhook({
      body: {
        id: 'notification-1',
        type: 'payment',
        action: 'payment.updated',
        date_created: '2026-07-15T12:00:00Z',
        data: { id: dataId },
      },
      query: { type: 'payment', 'data.id': dataId },
      headers: {
        'x-request-id': requestId,
        'x-signature': `ts=${ts},v1=${hash}`,
      },
    }, {
      repository,
      mercadoPago,
      webhookSecret: secret,
      deferProcessing: true,
    })

    expect(result).toMatchObject({ accepted: true, deferred: true, duplicate: false })
    expect(repository.recordWebhook).toHaveBeenCalledOnce()
    expect(repository.claimWebhookEvent).not.toHaveBeenCalled()
    expect(mercadoPago.getPayment).not.toHaveBeenCalled()
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
