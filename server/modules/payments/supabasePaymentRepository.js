import { createHash } from 'node:crypto'
import { HttpError } from '../../lib/errors.js'
import { PRIMARY_ORGANIZATION_ID } from '../../lib/organizations.js'
import { mapMercadoPagoStatus } from './paymentWorkflow.js'

const TEMP_VERCEL_TEST_MEMBERSHIP_AMOUNT = 1

function assertResult(result, fallbackMessage) {
  if (result.error) {
    throw new HttpError(503, result.error.message || fallbackMessage)
  }
  return result.data
}

function displayConcept(concept) {
  if (concept === 'membership') return 'Afiliacion PLU'
  if (concept === 'registration') return 'Inscripcion a competencia'
  if (concept === 'combo') return 'Afiliacion + inscripcion'
  return 'Pago PLU ARG'
}

export function createSupabasePaymentRepository(
  client,
  { organizationId = PRIMARY_ORGANIZATION_ID } = {},
) {
  if (!client) throw new HttpError(503, 'Supabase Admin no esta configurado.')

  async function getOrder(orderId) {
    const athleteResult = await client
      .from('athlete_payment_orders')
      // La inscripción se trae para poder mandar `registration_confirmed` con
      // el título real del evento cuando el pago entra por Mercado Pago. Sin
      // este join, ese email solo salía por la aprobación manual.
      .select(
        '*, athlete:athletes(id, full_name, email, document_id), registration:event_registrations(id, division, category, event:events(id, title, slug, starts_at, venue, registration_opens_at))',
      )
      .eq('id', orderId)
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (athleteResult.error) throw new HttpError(503, athleteResult.error.message || 'No se pudo leer la orden.')

    if (athleteResult.data) {
      const data = athleteResult.data
      return {
        kind: 'athlete',
        id: data.id,
        organizationId: data.organization_id,
        athleteId: data.athlete_id,
        amount: data.amount,
        currency: data.currency,
        concept: data.concept,
        displayConcept: displayConcept(data.concept),
        method: data.method,
        status: data.status,
        reference: data.reference,
        idempotencyKey: data.idempotency_key,
        planId: data.plan_id ?? null,
        preferenceId: data.provider_preference_id,
        initPoint: data.provider_init_point,
        payerEmail: data.payer_email ?? data.athlete?.email ?? null,
        athlete: data.athlete,
        // PostgREST devuelve un array en la relación inversa; interesa la única.
        registration: Array.isArray(data.registration) ? (data.registration[0] ?? null) : (data.registration ?? null),
      }
    }

    const ticketData = assertResult(
      await client
        .from('ticket_orders')
        .select('*, event:events(id, title, slug, registration_opens_at)')
        .eq('id', orderId)
        .eq('organization_id', organizationId)
        .maybeSingle(),
      'No se pudo leer la orden.',
    )
    if (!ticketData) throw new HttpError(404, 'Orden no encontrada.')
    return {
      kind: 'ticket',
      id: ticketData.id,
      organizationId: ticketData.organization_id,
      athleteId: null,
      amount: ticketData.amount,
      currency: ticketData.currency,
      concept: 'tickets',
      displayConcept: `Entradas ${ticketData.event?.title ?? 'PLU ARG'}`,
      method: ticketData.provider,
      status: ticketData.status,
      reference: ticketData.reference,
      idempotencyKey: ticketData.idempotency_key,
      preferenceId: ticketData.provider_preference_id,
      initPoint: ticketData.provider_init_point,
      payerEmail: ticketData.payer_email ?? ticketData.buyer_email ?? null,
      event: ticketData.event,
    }
  }

  return {
    getOrder,

    async recordClientEvent({ order, stage, errorCode, message }) {
      return assertResult(
        await client.from('operational_event_logs').insert({
          organization_id: order.organizationId ?? organizationId,
          source: 'payment',
          action: 'payment_brick.error',
          entity_type: order.kind === 'ticket' ? 'ticket_order' : 'athlete_payment_order',
          entity_id: order.id,
          actor_type: order.kind === 'ticket' ? 'buyer' : 'athlete',
          actor_id: order.athleteId ?? order.payerEmail ?? null,
          status: 'failed',
          severity: 'danger',
          metadata: {
            stage,
            errorCode: errorCode ?? null,
            error: message ?? null,
            payerEmail: order.payerEmail ?? null,
            reference: order.reference,
          },
        }),
        'No se pudo registrar el error del Brick.',
      )
    },

    async assertTicketOrderAccess(orderId, accessToken) {
      if (!accessToken) throw new HttpError(401, 'Falta el token de acceso de la orden.')
      const tokenHash = createHash('sha256').update(accessToken).digest('hex')
      const result = await client
        .from('ticket_orders')
        .select('id')
        .eq('id', orderId)
        .eq('organization_id', organizationId)
        .eq('access_token_hash', tokenHash)
        .maybeSingle()
      const order = assertResult(result, 'No se pudo validar la orden.')
      if (!order) throw new HttpError(403, 'Token de orden invalido.')
      return order
    },

    async claimEmbeddedAttempt({ order, tokenFingerprint, idempotencyKey, operationKind = 'payment' }) {
      return assertResult(
        await client.rpc(
          operationKind === 'subscription'
            ? 'claim_embedded_subscription_attempt'
            : 'claim_embedded_payment_attempt', {
          p_order_kind: order.kind,
          p_order_id: order.id,
          p_token_fingerprint: tokenFingerprint,
          p_idempotency_key: idempotencyKey,
          }),
        'No se pudo iniciar el pago embebido.',
      )
    },

    async completeEmbeddedAttempt(attemptId, { status, externalPaymentId, payload, error }) {
      return assertResult(
        await client.rpc('complete_embedded_payment_attempt', {
          p_attempt_id: attemptId,
          p_status: status,
          p_external_payment_id: externalPaymentId ? String(externalPaymentId) : null,
          p_payload: payload ?? null,
          p_error: error ?? null,
        }),
        'No se pudo finalizar el pago embebido.',
      )
    },

    /**
     * `orderKind` llega del workflow, que ya resolvio la orden en esta misma
     * request. Es un dato inmutable de la orden, asi que releerla solo para
     * elegir la tabla era un round-trip con joins de puro descarte (dos, en
     * ordenes de entradas: getOrder sondea athlete_payment_orders primero).
     * El fallback mantiene el contrato para cualquier caller que no lo pase.
     */
    async attachPreference(orderId, preference, idempotencyKey, orderKind) {
      const kind = orderKind ?? (await getOrder(orderId)).kind
      return assertResult(
        await client
          .from(kind === 'ticket' ? 'ticket_orders' : 'athlete_payment_orders')
          .update({
            provider_preference_id: preference.id,
            provider_init_point: preference.initPoint,
            idempotency_key: idempotencyKey,
            provider_payload: preference.raw,
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId)
          .select()
          .single(),
        'No se pudo guardar la preferencia.',
      )
    },

    async recordWebhook({ notificationId, resourceId, type, action, requestId, payload }) {
      const existing = assertResult(
        await client
          .from('payment_integration_events')
          .select('*')
          .eq('provider', 'mercado_pago')
          .eq('notification_id', notificationId)
          .maybeSingle(),
        'No se pudo consultar el webhook.',
      )
      if (existing) return { event: existing, created: false }

      const event = assertResult(
        await client
          .from('payment_integration_events')
          .insert({
            organization_id: organizationId,
            provider: 'mercado_pago',
            notification_id: notificationId,
            resource_id: resourceId,
            event_type: type,
            action,
            request_id: requestId,
            signature_valid: true,
            status: 'received',
            attempts_count: 0,
            next_retry_at: new Date().toISOString(),
            payload,
          })
          .select()
          .single(),
        'No se pudo registrar el webhook.',
      )
      return { event, created: true }
    },

    async claimWebhookEvent(eventId, { force = false } = {}) {
      return assertResult(
        await client.rpc('claim_payment_integration_event', {
          p_event_id: eventId,
          p_force: force,
        }),
        'No se pudo reclamar el evento de pago.',
      )
    },

    async claimDueWebhookEvents(limit = 20) {
      return assertResult(
        await client.rpc('claim_due_payment_integration_events', { p_limit: limit }),
        'No se pudieron recuperar eventos de pago.',
      ) ?? []
    },

    async markWebhookProcessed(eventId, result) {
      return assertResult(
        await client.rpc('complete_payment_integration_event', {
          p_event_id: eventId,
          p_succeeded: true,
          p_result: result,
          p_error: null,
        }),
        'No se pudo finalizar el webhook.',
      )
    },

    async markWebhookFailed(eventId, error) {
      return assertResult(
        await client.rpc('complete_payment_integration_event', {
          p_event_id: eventId,
          p_succeeded: false,
          p_result: null,
          p_error: error?.message ?? String(error),
        }),
        'No se pudo registrar la falla del webhook.',
      )
    },

    async claimEmbeddedReconciliations(limit = 20) {
      return assertResult(
        await client.rpc('claim_embedded_payment_reconciliations', { p_limit: limit }),
        'No se pudieron reclamar conciliaciones de pago.',
      ) ?? []
    },

    async claimEmbeddedReconciliation(attemptId, { force = false } = {}) {
      return assertResult(
        await client.rpc('claim_embedded_payment_reconciliation', {
          p_attempt_id: attemptId,
          p_force: force,
        }),
        'No se pudo reclamar la conciliacion.',
      )
    },

    async completeEmbeddedReconciliation(attemptId, { succeeded, terminal = false, error }) {
      return assertResult(
        await client.rpc('complete_embedded_payment_reconciliation', {
          p_attempt_id: attemptId,
          p_succeeded: succeeded,
          p_terminal: terminal,
          p_error: error ?? null,
        }),
        'No se pudo finalizar la conciliacion.',
      )
    },

    async getOperationsSummary() {
      const [summaryResult, healthResult] = await Promise.all([
        client.rpc('get_payment_operations_summary'),
        client.rpc('get_payment_system_health'),
      ])
      const summary = assertResult(
        summaryResult,
        'No se pudo obtener el estado de Mercado Pago.',
      )
      const health = assertResult(
        healthResult,
        'No se pudo verificar la integridad de Mercado Pago.',
      )
      return { ...summary, health }
    },

    async listIntegrationEvents({ status, limit = 50 } = {}) {
      let query = client
        .from('payment_integration_events')
        .select('id, notification_id, resource_id, event_type, action, status, attempts_count, max_attempts, error, received_at, last_attempt_at, processed_at, next_retry_at')
        .eq('organization_id', organizationId)
        .eq('provider', 'mercado_pago')
        .order('updated_at', { ascending: false })
        .limit(Math.max(1, Math.min(limit, 100)))
      if (status) query = query.eq('status', status)
      return assertResult(await query, 'No se pudieron listar los eventos de pago.') ?? []
    },

    async listReconciliationAttempts({ limit = 50 } = {}) {
      return assertResult(
        await client
          .from('embedded_payment_attempts')
          .select('id, order_kind, order_id, external_payment_id, status, reconciliation_status, reconciliation_attempts, next_reconcile_at, reconciled_at, error, created_at, updated_at')
          .eq('organization_id', organizationId)
          .eq('operation_kind', 'payment')
          .not('external_payment_id', 'is', null)
          .neq('reconciliation_status', 'reconciled')
          .order('updated_at', { ascending: false })
          .limit(Math.max(1, Math.min(limit, 100))),
        'No se pudieron listar las conciliaciones.',
      ) ?? []
    },

    /**
     * Idem `attachPreference`: `payment.orderKind` viene de la orden que el
     * workflow ya valido (monto, moneda y external_reference) antes de llamar.
     * Este era el tercer getOrder del mismo pago -- webhook, checkout embebido
     * y conciliacion pasan todos por aca.
     */
    async applyPayment(payment) {
      const kind = payment.orderKind ?? (await getOrder(payment.orderId)).kind
      return assertResult(
        await client.rpc(kind === 'ticket' ? 'apply_ticket_mercado_pago_payment' : 'apply_mercado_pago_payment', {
          p_order_id: payment.orderId,
          p_external_payment_id: String(payment.externalPaymentId),
          p_status: payment.status,
          p_amount: payment.amount,
          p_currency: payment.currency,
          p_payer_email: payment.payerEmail,
          p_status_detail: payment.statusDetail,
          p_payload: payment.raw,
        }),
        'No se pudo aplicar el pago.',
      )
    },

    async listPlans() {
      const now = new Date().toISOString()
      const plans = assertResult(
        await client
          .from('membership_plans')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('active', true)
          .lte('effective_from', now)
          .or(`retired_at.is.null,retired_at.gt.${now}`)
          .order('price'),
        'No se pudieron leer los planes.',
      )
      // TEMP VERCEL TEST: mostrar afiliacion anual a $1 para validar Mercado Pago.
      // Revertir al volver a precios reales.
      return plans.map((plan) =>
        plan.code === 'plu-annual' || plan.family_code === 'plu-annual'
          ? { ...plan, price: TEMP_VERCEL_TEST_MEMBERSHIP_AMOUNT }
          : plan,
      )
    },

    async prepareSubscription({ paymentOrderId, planCode }) {
      const order = await getOrder(paymentOrderId)
      if (order.kind !== 'athlete') throw new HttpError(400, 'La orden no corresponde a una afiliacion.')
      if (order.concept !== 'membership') {
        throw new HttpError(409, 'La orden no corresponde a una suscripcion de afiliacion.')
      }
      if (!['pendiente', 'creado'].includes(order.status)) {
        throw new HttpError(409, 'La orden ya no admite una suscripcion.')
      }
      const prepared = assertResult(
        await client.rpc('prepare_mercado_pago_subscription', {
          p_order_id: paymentOrderId,
          p_plan_code: planCode,
        }),
        'No se pudo preparar la suscripcion.',
      )
      const { plan, membership, subscription, created } = prepared
      if (!plan || !membership || !subscription) {
        throw new HttpError(503, 'La preparacion de la suscripcion devolvio un contrato incompleto.')
      }
      if (order.planId !== plan.id || membership.athlete_id !== order.athleteId) {
        throw new HttpError(409, 'La orden no coincide con el contrato de suscripcion.')
      }
      return { order, plan, membership, subscription, created }
    },

    async attachSubscriptionProvider(subscriptionId, providerSubscription) {
      return assertResult(
        await client
          .from('billing_subscriptions')
          .update({
            provider_subscription_id: providerSubscription.id,
            status: providerSubscription.status === 'authorized' ? 'authorized' : 'pending',
            raw_payload: providerSubscription,
            updated_at: new Date().toISOString(),
          })
          .eq('id', subscriptionId)
          .select()
          .single(),
        'No se pudo asociar la suscripcion.',
      )
    },

    async attachPlanProvider(planId, providerPlan) {
      return assertResult(
        await client
          .from('membership_plans')
          .update({ provider_plan_id: providerPlan.id, updated_at: new Date().toISOString() })
          .eq('id', planId)
          .select()
          .single(),
        'No se pudo asociar el plan de Mercado Pago.',
      )
    },

    async applySubscription(providerSubscription) {
      const statusMap = {
        authorized: 'authorized',
        paused: 'paused',
        cancelled: 'cancelled',
        canceled: 'cancelled',
        pending: 'pending',
      }
      const status = statusMap[providerSubscription.status] ?? 'pending'
      return assertResult(
        await client.rpc('apply_mercado_pago_subscription', {
          p_provider_subscription_id: String(providerSubscription.id),
          p_external_reference: providerSubscription.external_reference ?? null,
          p_status: status,
          p_payload: providerSubscription,
        }),
        'No se pudo actualizar la suscripcion.',
      )
    },

    async applyAuthorizedSubscriptionPayment(authorizedPayment) {
      const externalPaymentId = authorizedPayment.payment_id ?? authorizedPayment.id
      const providerSubscriptionId = authorizedPayment.preapproval_id
      if (!providerSubscriptionId || !externalPaymentId) {
        throw new HttpError(409, 'Pago recurrente sin suscripcion o payment id.')
      }
      return assertResult(
        await client.rpc('apply_subscription_payment', {
          p_provider_subscription_id: String(providerSubscriptionId),
          p_external_payment_id: String(externalPaymentId),
          p_status: mapMercadoPagoStatus(authorizedPayment.status),
          p_amount: Number(authorizedPayment.transaction_amount),
          p_currency: authorizedPayment.currency_id ?? 'ARS',
          p_payer_email: authorizedPayment.payer_email ?? null,
          p_status_detail: authorizedPayment.status_detail ?? null,
          p_payload: authorizedPayment,
        }),
        'No se pudo aplicar el pago recurrente.',
      )
    },
  }
}
