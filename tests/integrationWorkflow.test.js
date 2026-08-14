import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryIntegrationEventStore } from '../server/modules/integrations/integrationEventStore.js'
import {
  applyCanonicalPayment,
  createPaymentPreference,
  mapMercadoPagoStatus,
  processClaimedPaymentEvent,
  processPaymentWebhook,
} from '../server/modules/payments/paymentWorkflow.js'
import { queueTransactionalEmail } from '../server/modules/notifications/notificationWorkflow.js'

describe('integration workflows', () => {
  it('registra preferencias de pago con idempotencia por clave de negocio', async () => {
    let order = {
      id: '8e9edb56-2dbf-45fb-9a79-60c31843f6df',
      athleteId: 'ath-001',
      amount: 75000,
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

  it('rechaza webhooks cuyo data.id no viene firmado en la URL', async () => {
    await expect(processPaymentWebhook({
      body: {
        id: 'notification-without-query-id',
        type: 'payment',
        data: { id: 'payment-only-in-body' },
      },
      query: { type: 'payment' },
      headers: {},
    }, {
      repository: {},
      mercadoPago: {},
      webhookSecret: 'webhook-secret-for-tests',
    })).rejects.toThrow('Webhook sin data.id en la URL.')
  })

  it('aplica un webhook de pago una sola vez aunque Mercado Pago lo reenvie', async () => {
    const secret = 'webhook-secret-for-tests'
    const requestId = 'request-dup-1'
    const dataId = 'payment-dup-1'
    const ts = Date.now()
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
    const hash = createHmac('sha256', secret).update(manifest).digest('hex')
    const event = { id: 'event-dup-1', status: 'received', resource_id: dataId, event_type: 'payment' }
    const order = { id: 'order-dup-1', kind: 'athlete', amount: 50000, currency: 'ARS' }
    const payment = {
      id: dataId,
      status: 'approved',
      external_reference: order.id,
      transaction_amount: 50000,
      currency_id: 'ARS',
    }

    const recordWebhook = vi.fn()
      // Primera entrega: notificacion nueva.
      .mockResolvedValueOnce({ event, created: true })
      // Reenvio de Mercado Pago (mismo notification.id): ya quedo procesada.
      .mockResolvedValueOnce({ event: { ...event, status: 'processed' }, created: false })
    const repository = {
      recordWebhook,
      claimWebhookEvent: vi.fn(async () => event),
      getOrder: vi.fn(async () => order),
      applyPayment: vi.fn(async () => ({ order: { ...order, status: 'aprobado' } })),
      markWebhookProcessed: vi.fn(async () => ({ ...event, status: 'processed' })),
    }
    const mercadoPago = { getPayment: vi.fn(async () => payment) }

    const input = {
      body: {
        id: 'notification-dup-1',
        type: 'payment',
        action: 'payment.updated',
        date_created: '2026-07-15T12:00:00Z',
        data: { id: dataId },
      },
      query: { type: 'payment', 'data.id': dataId },
      headers: { 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${hash}` },
    }
    const options = { repository, mercadoPago, webhookSecret: secret }

    const first = await processPaymentWebhook(input, options)
    const retry = await processPaymentWebhook(input, options)

    expect(first.duplicate).toBe(false)
    expect(retry.duplicate).toBe(true)
    expect(mercadoPago.getPayment).toHaveBeenCalledOnce()
    expect(repository.applyPayment).toHaveBeenCalledOnce()
  })

  it('no reprocesa un evento que otro worker ya esta aplicando en paralelo', async () => {
    const secret = 'webhook-secret-for-tests'
    const requestId = 'request-inflight-1'
    const dataId = 'payment-inflight-1'
    const ts = Date.now()
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
    const hash = createHmac('sha256', secret).update(manifest).digest('hex')
    const repository = {
      recordWebhook: vi.fn(async () => ({ event: { id: 'event-inflight-1', status: 'received' }, created: true })),
      // Null simula que el UPDATE ... WHERE status='received' de otro worker
      // ya gano la carrera y reclamo el evento primero.
      claimWebhookEvent: vi.fn(async () => null),
    }
    const mercadoPago = { getPayment: vi.fn() }

    const result = await processPaymentWebhook({
      body: {
        id: 'notification-inflight-1',
        type: 'payment',
        date_created: '2026-07-15T12:00:00Z',
        data: { id: dataId },
      },
      query: { type: 'payment', 'data.id': dataId },
      headers: { 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${hash}` },
    }, { repository, mercadoPago, webhookSecret: secret })

    expect(result).toMatchObject({ duplicate: true, inFlight: true })
    expect(mercadoPago.getPayment).not.toHaveBeenCalled()
  })

  it('rechaza acreditar un pago cuyo monto, moneda u orden no coincide', async () => {
    const order = { id: 'order-guard-1', kind: 'athlete', amount: 50000, currency: 'ARS' }
    const repository = { applyPayment: vi.fn() }

    const wrongAmount = { id: 'pay-1', external_reference: order.id, transaction_amount: 40000, currency_id: 'ARS', status: 'approved' }
    await expect(applyCanonicalPayment(wrongAmount, order, { repository }))
      .rejects.toThrow('Monto de pago invalido para la orden.')

    const wrongCurrency = { id: 'pay-2', external_reference: order.id, transaction_amount: 50000, currency_id: 'USD', status: 'approved' }
    await expect(applyCanonicalPayment(wrongCurrency, order, { repository }))
      .rejects.toThrow('Moneda de pago invalida para la orden.')

    const wrongOrder = { id: 'pay-3', external_reference: 'otra-orden', transaction_amount: 50000, currency_id: 'ARS', status: 'approved' }
    await expect(applyCanonicalPayment(wrongOrder, order, { repository }))
      .rejects.toThrow('El pago no pertenece a la orden informada.')

    expect(repository.applyPayment).not.toHaveBeenCalled()
  })

  it('avisa al socio cuando un cobro recurrente es rechazado', async () => {
    const authorizedPayment = {
      id: 'auth-pay-1',
      payment_id: 'auth-pay-1',
      preapproval_id: 'preapproval-1',
      status: 'rejected',
      status_detail: 'cc_rejected_insufficient_amount',
      transaction_amount: 38000,
      currency_id: 'ARS',
    }
    const order = {
      id: 'order-sub-1',
      concept: 'membership',
      reference: 'SUB-1-auth-pay-1',
      payer_email: 'socio@example.com',
    }
    const notifyPaymentApplied = vi.fn(async () => [])
    const repository = {
      applyAuthorizedSubscriptionPayment: vi.fn(async () => ({ order, subscription: {}, payment: {} })),
      markWebhookProcessed: vi.fn(async () => ({ id: 'event-sub-1', status: 'processed' })),
    }
    const mercadoPago = { getAuthorizedPayment: vi.fn(async () => authorizedPayment) }

    await processClaimedPaymentEvent(
      { id: 'event-sub-1', resource_id: 'auth-pay-1', event_type: 'subscription_authorized_payment' },
      { repository, mercadoPago, notifyPaymentApplied },
    )

    expect(notifyPaymentApplied).toHaveBeenCalledOnce()
    const call = notifyPaymentApplied.mock.calls[0][0]
    expect(call.payment.status).toBe('rechazado')
    expect(call.order.payerEmail).toBe('socio@example.com')
  })

  it('no avisa nada cuando el cobro recurrente sale aprobado', async () => {
    const authorizedPayment = {
      id: 'auth-pay-2',
      payment_id: 'auth-pay-2',
      status: 'approved',
      transaction_amount: 38000,
      currency_id: 'ARS',
    }
    const notifyPaymentApplied = vi.fn(async () => [])
    const repository = {
      applyAuthorizedSubscriptionPayment: vi.fn(async () => ({
        order: { id: 'order-sub-2', payer_email: 'socio@example.com' },
      })),
      markWebhookProcessed: vi.fn(async () => ({ id: 'event-sub-2', status: 'processed' })),
    }
    const mercadoPago = { getAuthorizedPayment: vi.fn(async () => authorizedPayment) }

    await processClaimedPaymentEvent(
      { id: 'event-sub-2', resource_id: 'auth-pay-2', event_type: 'subscription_authorized_payment' },
      { repository, mercadoPago, notifyPaymentApplied },
    )

    expect(notifyPaymentApplied).not.toHaveBeenCalled()
  })

  it('avisa al socio cuando Mercado Pago cancela la suscripcion', async () => {
    const subscription = { id: 'sub-1', status: 'cancelled', initial_order_id: 'order-initial-1' }
    const order = { id: 'order-initial-1', payerEmail: 'socio@example.com', amount: 38000 }
    const notifyPaymentApplied = vi.fn(async () => [])
    const repository = {
      applySubscription: vi.fn(async () => subscription),
      getOrder: vi.fn(async () => order),
      markWebhookProcessed: vi.fn(async () => ({ id: 'event-sub-3', status: 'processed' })),
    }
    const mercadoPago = { getSubscription: vi.fn(async () => ({ id: 'mp-preapproval-1' })) }

    await processClaimedPaymentEvent(
      { id: 'event-sub-3', resource_id: 'mp-preapproval-1', event_type: 'subscription_preapproval' },
      { repository, mercadoPago, notifyPaymentApplied },
    )

    expect(repository.getOrder).toHaveBeenCalledWith('order-initial-1')
    expect(notifyPaymentApplied).toHaveBeenCalledOnce()
    expect(notifyPaymentApplied.mock.calls[0][0].payment.status).toBe('rechazado')
  })

  it('no avisa nada cuando la suscripcion sigue autorizada', async () => {
    const notifyPaymentApplied = vi.fn(async () => [])
    const repository = {
      applySubscription: vi.fn(async () => ({ id: 'sub-2', status: 'authorized' })),
      getOrder: vi.fn(),
      markWebhookProcessed: vi.fn(async () => ({ id: 'event-sub-4', status: 'processed' })),
    }
    const mercadoPago = { getSubscription: vi.fn(async () => ({ id: 'mp-preapproval-2' })) }

    await processClaimedPaymentEvent(
      { id: 'event-sub-4', resource_id: 'mp-preapproval-2', event_type: 'subscription_preapproval' },
      { repository, mercadoPago, notifyPaymentApplied },
    )

    expect(repository.getOrder).not.toHaveBeenCalled()
    expect(notifyPaymentApplied).not.toHaveBeenCalled()
  })

  it('encola emails transaccionales sin duplicarlos ante retries', async () => {
    const eventStore = createMemoryIntegrationEventStore()
    const input = {
      to: 'martina.rivas@example.com',
      params: { name: 'Martina Rivas', amount: 120000 },
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
