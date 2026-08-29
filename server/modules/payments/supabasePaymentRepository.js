import { createHash } from 'node:crypto'
import { HttpError } from '../../lib/errors.js'
import { PRIMARY_ORGANIZATION_ID } from '../../lib/organizations.js'
import { assertSupabaseResult } from '../../lib/supabaseRpc.js'
import {
  describePaymentConcept,
  paymentConceptInputFromOrder,
} from '../../../src/lib/paymentConcept.js'
import { mapMercadoPagoStatus } from './paymentWorkflow.js'

function assertResult(result, fallbackMessage) {
  return assertSupabaseResult(result, fallbackMessage)
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
      //
      // El plan y la afiliación entran por lo mismo que la inscripción: son los
      // datos con los que se declara el cobro (modalidad y año del ciclo). El
      // título que sale de acá es el que ve el atleta en el resumen de la
      // tarjeta y Finanzas en la app de Mercado Pago.
      .select(
        '*, athlete:athletes(id, full_name, email, document_id), plan:membership_plans(billing_frequency), membership:memberships(year), registration:event_registrations(id, division, category, event:events(id, title, slug, starts_at, venue, registration_opens_at, mercado_pago_profile_id))',
      )
      .eq('id', orderId)
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (athleteResult.error)
      throw new HttpError(503, athleteResult.error.message || 'No se pudo leer la orden.')

    if (athleteResult.data) {
      const data = athleteResult.data
      const described = describePaymentConcept(paymentConceptInputFromOrder(data))
      return {
        kind: 'athlete',
        id: data.id,
        organizationId: data.organization_id,
        athleteId: data.athlete_id,
        amount: data.amount,
        currency: data.currency,
        concept: data.concept,
        displayConcept: described.title,
        conceptDetail: described.detail,
        conceptItems: described.items,
        method: data.method,
        manualPaymentChannel: data.manual_payment_channel ?? null,
        status: data.status,
        reference: data.reference,
        idempotencyKey: data.idempotency_key,
        planId: data.plan_id ?? null,
        preferenceId: data.provider_preference_id,
        initPoint: data.provider_init_point,
        payerEmail: data.payer_email ?? data.athlete?.email ?? null,
        athlete: data.athlete,
        // Ciclo de vida del cobro: lo consume el estado público de la orden
        // para saber si sigue abierta, si espera comprobante o por qué se cerró.
        expiresAt: data.expires_at ?? null,
        approvedAt: data.approved_at ?? null,
        rejectedAt: data.rejected_at ?? null,
        rejectionReason: data.rejection_reason ?? null,
        paymentProofUploadedAt: data.payment_proof_uploaded_at ?? null,
        // PostgREST devuelve un array en la relación inversa; interesa la única.
        registration: Array.isArray(data.registration)
          ? (data.registration[0] ?? null)
          : (data.registration ?? null),
        mercadoPagoProfileId:
          (Array.isArray(data.registration)
            ? data.registration[0]?.event?.mercado_pago_profile_id
            : data.registration?.event?.mercado_pago_profile_id) ?? null,
      }
    }

    const ticketData = assertResult(
      await client
        .from('ticket_orders')
        .select(
          '*, event:events(id, title, slug, registration_opens_at, mercado_pago_profile_id)',
        )
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
      displayConcept: describePaymentConcept({
        concept: 'tickets',
        eventTitle: ticketData.event?.title ?? null,
      }).title,
      method: ticketData.provider,
      manualPaymentChannel: ticketData.manual_payment_channel ?? null,
      status: ticketData.status,
      reference: ticketData.reference,
      idempotencyKey: ticketData.idempotency_key,
      preferenceId: ticketData.provider_preference_id,
      initPoint: ticketData.provider_init_point,
      payerEmail: ticketData.payer_email ?? ticketData.buyer_email ?? null,
      expiresAt: ticketData.reservation_expires_at ?? null,
      approvedAt: ticketData.approved_at ?? null,
      rejectedAt: ticketData.rejected_at ?? null,
      rejectionReason: ticketData.rejection_reason ?? null,
      paymentProofUploadedAt: ticketData.payment_proof_uploaded_at ?? null,
      event: ticketData.event,
      mercadoPagoProfileId: ticketData.event?.mercado_pago_profile_id ?? null,
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

    async claimEmbeddedAttempt({
      order,
      tokenFingerprint,
      idempotencyKey,
      operationKind = 'payment',
    }) {
      return assertResult(
        await client.rpc(
          operationKind === 'subscription'
            ? 'claim_embedded_subscription_attempt'
            : 'claim_embedded_payment_attempt',
          {
            p_order_kind: order.kind,
            p_order_id: order.id,
            p_token_fingerprint: tokenFingerprint,
            p_idempotency_key: idempotencyKey,
          },
        ),
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

    // `signatureValid` en false es la marca de una IPN: MP no firma ese formato,
    // así que el evento se resolvió preguntándole a la API por el recurso en vez
    // de confiar en el manifiesto HMAC. Queda asentado para poder distinguir en
    // la bandeja qué entró firmado y qué se verificó contra el proveedor.
    async recordWebhook({
      notificationId,
      resourceId,
      type,
      action,
      requestId,
      payload,
      signatureValid = true,
    }) {
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
            signature_valid: signatureValid,
            status: 'received',
            attempts_count: 0,
            // Se reclama inline inmediatamente después de insertar. Dejarlo
            // exactamente en "ahora" dependía de que el reloj del proceso y
            // el de Postgres coincidieran al milisegundo: si la base quedaba
            // apenas adelantada, `claim_payment_integration_event` devolvía
            // null y el webhook respondía 200 sin acreditarlo. Un segundo de
            // margen lo deja elegible tanto para el reclamo inline como para
            // el worker, sin cambiar la política de reintentos.
            next_retry_at: new Date(Date.now() - 1_000).toISOString(),
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
      return (
        assertResult(
          await client.rpc('claim_due_payment_integration_events', { p_limit: limit }),
          'No se pudieron recuperar eventos de pago.',
        ) ?? []
      )
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

    /**
     * Ordenes de Mercado Pago que localmente quedaron cerradas sin un solo
     * asiento de cobro. Son las candidatas a "en MP figura pagado y en la app
     * dice cancelado": el checkout se abrio (hay preferencia), el cron las
     * vencio a los 30 minutos y el webhook nunca llego — porque se cayo, porque
     * la firma se rechazo, o porque el atleta pago despues de que la orden
     * vencio y cerro la pestana sin volver.
     *
     * Se acotan a las ultimas horas y a un lote chico: es una red, no un
     * reprocesamiento del historico. Una orden sin preferencia nunca abrio
     * checkout, asi que no hay nada que preguntarle al proveedor.
     */
    /**
     * Órdenes de Mercado Pago que ya no deberían seguir esperando y no tienen
     * un solo asiento de cobro local. Son las candidatas a "en MP figura pagado
     * y acá no figura nada".
     *
     * Incluye dos formas de quedarse sin cobro, no una:
     *
     *   - `cancelado`/`rechazado`: el cron de dominio ya las cerró.
     *   - `pendiente` con la ventana vencida: el checkout se abrió, nadie
     *     volvió, y el cron de dominio todavía no pasó a cerrarla.
     *
     * El segundo caso faltaba, y es justamente el que reporta la organización:
     * "pagó por Mercado Pago, figura pendiente y no da de alta". Con el webhook
     * caído esa orden no tenía ningún camino de rescate — se quedaba pendiente
     * hasta que la cancelaran, y recién ahí, en la próxima pasada, alguien le
     * preguntaba a MP. Una orden pendiente pero todavía en ventana no entra: el
     * atleta puede estar pagando en este momento.
     */
    async listOrdersWithoutLocalPayment(limit = 20, { sinceHours = 6 } = {}) {
      const since = new Date(Date.now() - sinceHours * 3_600_000).toISOString()
      const nowIso = new Date().toISOString()
      const candidates =
        assertResult(
          await client
            .from('athlete_payment_orders')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('method', 'mercado_pago')
            .not('provider_preference_id', 'is', null)
            .gte('updated_at', since)
            .or(
              `status.in.(cancelado,rechazado),and(status.eq.pendiente,expires_at.lt.${nowIso})`,
            )
            .order('updated_at', { ascending: false })
            .limit(limit),
          'No se pudieron leer las ordenes sin cobro local.',
        ) ?? []
      if (!candidates.length) return []

      const ids = candidates.map((row) => row.id)
      const settled =
        assertResult(
          await client.from('athlete_payments').select('order_id').in('order_id', ids),
          'No se pudieron leer los intentos de cobro.',
        ) ?? []
      const withPayments = new Set(settled.map((row) => row.order_id))
      return ids.filter((id) => !withPayments.has(id))
    },

    async claimEmbeddedReconciliations(limit = 20) {
      return (
        assertResult(
          await client.rpc('claim_embedded_payment_reconciliations', { p_limit: limit }),
          'No se pudieron reclamar conciliaciones de pago.',
        ) ?? []
      )
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

    async stopEmbeddedReconciliation(attemptId, { error }) {
      return assertResult(
        await client.rpc('stop_embedded_payment_reconciliation', {
          p_attempt_id: attemptId,
          p_error: error ?? 'Conciliación detenida por una falla no reintentable.',
        }),
        'No se pudo detener la conciliación.',
      )
    },

    async getOperationsSummary() {
      const [summaryResult, healthResult] = await Promise.all([
        client.rpc('get_payment_operations_summary'),
        client.rpc('get_payment_system_health'),
      ])
      const summary = assertResult(summaryResult, 'No se pudo obtener el estado de Mercado Pago.')
      const health = assertResult(
        healthResult,
        'No se pudo verificar la integridad de Mercado Pago.',
      )
      return { ...summary, health }
    },

    /**
     * Cuántos cobros se cortaron por cada motivo, en un rango de fechas.
     * `paymentAuditTrail.recordFailure` ya guarda el diagnóstico clasificado
     * en `metadata.diagnosis` de cada asiento fallido — acá solo se cuenta,
     * no se re-clasifica nada.
     */
    async getFailureReasonBreakdown({ from, to } = {}) {
      let query = client
        .from('operational_event_logs')
        .select('entity_id, created_at, metadata')
        .eq('organization_id', organizationId)
        .eq('source', 'payment')
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(500)
      if (from) query = query.gte('created_at', from)
      if (to) query = query.lte('created_at', to)

      const rows = assertResult(await query, 'No se pudieron leer los motivos de rechazo.') ?? []

      const byCode = new Map()
      for (const row of rows) {
        const diagnosis = row.metadata?.diagnosis
        const code = diagnosis?.code ?? 'UNCLASSIFIED_PAYMENT_FAILURE'
        const existing = byCode.get(code)
        if (existing) {
          existing.count += 1
          continue
        }
        byCode.set(code, {
          code,
          title: diagnosis?.title ?? 'Falla sin clasificar',
          severity: diagnosis?.severity ?? 'unexpected',
          count: 1,
          // Filas mas nuevas primero: la muestra es el caso mas reciente de
          // este motivo, el mas util para abrir su traza completa.
          sampleOrderId: row.entity_id ?? null,
          lastSeenAt: row.created_at,
        })
      }

      return [...byCode.values()].sort((a, b) => b.count - a.count)
    },

    /**
     * Ordenes de Mercado Pago candidatas a revalidacion: las que todavia no
     * estan aprobadas.
     *
     * Son las unicas donde puede haber plata sin acreditar. Una orden aprobada
     * tambien puede divergir (un reembolso posterior que no notifico), pero
     * revalidar todo el historico cada vez costaria una llamada al proveedor
     * por orden; el barrido masivo apunta al caso que rompe —el cobro que
     * entro y no figura— y para el reembolso queda la revalidacion puntual.
     */
    async listOrdersForRevalidation({
      statuses = ['pendiente', 'rechazado', 'cancelado'],
      sinceDays = 30,
      limit = 25,
    } = {}) {
      const since = new Date(
        Date.now() - Math.max(1, sinceDays) * 24 * 60 * 60 * 1000,
      ).toISOString()
      const cap = Math.max(1, Math.min(limit, 100))

      const [athleteOrders, ticketOrders] = await Promise.all([
        client
          .from('athlete_payment_orders')
          .select('id, status, amount, currency, concept, reference, created_at')
          .eq('organization_id', organizationId)
          .eq('method', 'mercado_pago')
          .in('status', statuses)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(cap),
        client
          .from('ticket_orders')
          .select('id, status, amount, currency, reference, created_at')
          .eq('organization_id', organizationId)
          .eq('provider', 'mercado_pago')
          .in('status', statuses)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(cap),
      ])

      const athletes = (
        assertResult(athleteOrders, 'No se pudieron leer las ordenes a revalidar.') ?? []
      ).map((row) => ({ ...row, kind: 'athlete' }))
      const tickets = (
        assertResult(ticketOrders, 'No se pudieron leer las ordenes a revalidar.') ?? []
      ).map((row) => ({ ...row, kind: 'ticket', concept: 'tickets' }))

      return [...athletes, ...tickets]
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, cap)
    },

    async listIntegrationEvents({ status, limit = 50 } = {}) {
      let query = client
        .from('payment_integration_events')
        .select(
          'id, notification_id, resource_id, event_type, action, status, attempts_count, max_attempts, error, received_at, last_attempt_at, processed_at, next_retry_at',
        )
        .eq('organization_id', organizationId)
        .eq('provider', 'mercado_pago')
        .order('updated_at', { ascending: false })
        .limit(Math.max(1, Math.min(limit, 100)))
      if (status) query = query.eq('status', status)
      return assertResult(await query, 'No se pudieron listar los eventos de pago.') ?? []
    },

    async listReconciliationAttempts({ limit = 50 } = {}) {
      return (
        assertResult(
          await client
            .from('embedded_payment_attempts')
            .select(
              'id, order_kind, order_id, external_payment_id, status, reconciliation_status, reconciliation_attempts, next_reconcile_at, reconciled_at, error, created_at, updated_at',
            )
            .eq('organization_id', organizationId)
            .eq('operation_kind', 'payment')
            .not('external_payment_id', 'is', null)
            .neq('reconciliation_status', 'reconciled')
            .order('updated_at', { ascending: false })
            .limit(Math.max(1, Math.min(limit, 100))),
          'No se pudieron listar las conciliaciones.',
        ) ?? []
      )
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
        await client.rpc(
          kind === 'ticket' ? 'apply_ticket_mercado_pago_payment' : 'apply_mercado_pago_payment',
          {
            p_order_id: payment.orderId,
            p_external_payment_id: String(payment.externalPaymentId),
            p_status: payment.status,
            p_amount: payment.amount,
            p_currency: payment.currency,
            p_payer_email: payment.payerEmail,
            p_status_detail: payment.statusDetail,
            p_payload: payment.raw,
          },
        ),
        'No se pudo aplicar el pago.',
      )
    },

    /**
     * Intentos de cobro de una orden. `athlete_payments` / `ticket_payments` es
     * el libro real: una fila por pago del proveedor, protegida por la guarda
     * monotonica, y el estado de la orden es su agregado. Todo lo que se muestre
     * como "progreso" o "por que se rechazo" sale de aca, nunca de
     * `provider_payload` de la orden — esa columna la pisa el ultimo intento
     * aplicado, que puede ser uno fallido posterior al que acredito.
     *
     * `raw_payload` queda deliberadamente afuera: pesa mas que todo el resto
     * junto y no hay nada que mostrar en el que no este en estas columnas.
     */
    async listOrderPayments(orderId, kind = 'athlete') {
      const table = kind === 'ticket' ? 'ticket_payments' : 'athlete_payments'
      return (
        assertResult(
          await client
            .from(table)
            .select('external_payment_id, status, status_detail, amount, currency, confirmed_at, created_at, updated_at')
            .eq('order_id', orderId)
            .order('created_at'),
          'No se pudieron leer los intentos de cobro.',
        ) ?? []
      )
    },

    async listPlans() {
      // 5-second buffer para evitar que la truncacion de milisegundos en JS
      // oculte planes creados en la misma transaccion por la base de datos.
      const now = new Date(Date.now() + 5000).toISOString()
      return assertResult(
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
    },

    /**
     * Versiones de plan ya publicadas cuya vigencia todavía no llegó. Son el
     * "aumento programado" de afiliaciones: listPlans las oculta (correcto
     * para cobrar), pero el catálogo público las necesita para anunciar
     * "a partir del <fecha> pasa a <precio>". Orden ascendente: la primera de
     * cada familia es el próximo cambio.
     */
    async listUpcomingPlanChanges() {
      const now = new Date(Date.now() + 5000).toISOString()
      return assertResult(
        await client
          .from('membership_plans')
          .select('family_code, price, manual_price, currency, effective_from')
          .eq('organization_id', organizationId)
          .eq('active', true)
          .gt('effective_from', now)
          .or(`retired_at.is.null,retired_at.gt.${now}`)
          .order('effective_from', { ascending: true }),
        'No se pudieron leer los cambios de plan programados.',
      )
    },

    async prepareSubscription({ paymentOrderId, planCode }) {
      const order = await getOrder(paymentOrderId)
      if (order.kind !== 'athlete')
        throw new HttpError(400, 'La orden no corresponde a una afiliacion.')
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
        throw new HttpError(
          503,
          'La preparacion de la suscripcion devolvio un contrato incompleto.',
        )
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

    async listSubscriptions(filters = {}) {
      return assertResult(
        await client.rpc('staff_list_billing_subscriptions', { p_filters: filters }),
        'No se pudieron leer las suscripciones.',
      )
    },

    async getSubscriptionForCancellation(subscriptionId) {
      return assertResult(
        await client
          .from('billing_subscriptions')
          .select('id, organization_id, athlete_id, status, provider_subscription_id')
          .eq('id', subscriptionId)
          .eq('organization_id', organizationId)
          .maybeSingle(),
        'No se pudo leer la suscripcion.',
      )
    },

    async cancelSubscription(subscriptionId, actor) {
      return assertResult(
        await client.rpc('staff_cancel_membership_subscription', {
          p_subscription_id: subscriptionId,
          p_actor: actor,
        }),
        'No se pudo cancelar la suscripcion.',
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
