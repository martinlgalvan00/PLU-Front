import { createHash } from 'node:crypto'
import { HttpError } from '../../lib/errors.js'
import { addBreadcrumb } from '../../lib/logger.js'
import {
  verifyMercadoPagoWebhook,
  webhookTimestampSkewSeconds,
} from '../integrations/webhookVerifier.js'
import { displayPaymentConcept } from '../notifications/paymentNotificationService.js'
import { describeWebhookDiscard } from './paymentFailureCatalog.js'
import {
  PAYMENT_TRAIL_ACTIONS,
  paymentTrailMetadata,
  summarizeFailure,
} from './paymentAuditTrail.js'

function stableKey(prefix, value) {
  return `${prefix}-${createHash('sha256').update(String(value)).digest('hex').slice(0, 40)}`
}

export function mapMercadoPagoStatus(status) {
  if (status === 'approved') return 'aprobado'
  if (status === 'rejected') return 'rechazado'
  if (status === 'cancelled') return 'cancelado'
  if (status === 'refunded' || status === 'charged_back') return 'reembolsado'
  return 'pendiente'
}

export async function createPaymentPreference(input, options = {}) {
  const { repository, mercadoPago, auditTrail } = options
  if (!repository || !mercadoPago) {
    throw new HttpError(503, 'El workflow de pagos no esta configurado.')
  }

  // La ruta ya resolvio la orden para validar que pertenece a la sesion; sin
  // reusarla, cada apertura de checkout la leia de nuevo con sus joins (mismo
  // patron que embeddedPaymentWorkflow.processEmbeddedPayment).
  const order =
    options.order?.id === input.paymentOrderId
      ? options.order
      : await repository.getOrder(input.paymentOrderId)
  if (order.method !== 'mercado_pago') {
    throw new HttpError(400, 'La orden no usa Mercado Pago.')
  }
  if (!['pendiente', 'creado'].includes(order.status)) {
    throw new HttpError(409, 'La orden ya no admite un nuevo checkout.')
  }
  if (order.preferenceId && order.initPoint) {
    await auditTrail?.record({
      action: PAYMENT_TRAIL_ACTIONS.preferenceReused,
      order,
      status: order.status,
      metadata: { preferenceId: order.preferenceId },
    })
    return {
      paymentOrder: order,
      preference: { id: order.preferenceId, initPoint: order.initPoint },
      created: false,
    }
  }

  const idempotencyKey = order.idempotencyKey || stableKey('preference', order.id)
  let preference
  try {
    preference = await mercadoPago.createPreference({
      order,
      appUrl: input.appUrl,
      apiUrl: input.apiUrl,
      idempotencyKey,
    })
    await repository.attachPreference(order.id, preference, idempotencyKey, order.kind)
  } catch (error) {
    // Sin este asiento, una preferencia que nunca se creo era un hueco mudo:
    // el atleta veia "no se pudo abrir el pago" y no quedaba nada del lado
    // nuestro para saber si fue el token, la URL o la base.
    await auditTrail?.recordFailure({
      stage: 'preference',
      order,
      error,
      metadata: { idempotencyKey },
    })
    throw error
  }

  await auditTrail?.record({
    action: PAYMENT_TRAIL_ACTIONS.preferenceCreated,
    order,
    status: order.status,
    severity: 'success',
    metadata: { preferenceId: preference.id, idempotencyKey },
  })

  return {
    paymentOrder: {
      ...order,
      idempotencyKey,
      preferenceId: preference.id,
      initPoint: preference.initPoint,
    },
    preference: {
      id: preference.id,
      initPoint: preference.initPoint,
      externalReference: preference.externalReference,
    },
    created: true,
  }
}

function notificationKey(body) {
  return [body.id, body.action, body.date_created].filter(Boolean).join(':')
}

/**
 * `topic` (IPN, formato viejo) → `event_type` (el vocabulario con el que
 * `processClaimedPaymentEvent` decide qué recurso consultar).
 *
 * `merchant_order` queda deliberadamente afuera: es la orden comercial, no el
 * cobro. El pago que la compone llega por su propia notificación, y procesar la
 * merchant_order sería acreditar dos veces el mismo dinero.
 */
const IPN_TOPIC_TO_EVENT_TYPE = {
  payment: 'payment',
  preapproval: 'subscription_preapproval',
  authorized_payment: 'subscription_authorized_payment',
}

function assertPaymentMatchesOrder(payment, orderId) {
  if (String(payment.external_reference ?? '') !== String(orderId)) {
    throw new HttpError(409, 'El pago no pertenece a la orden informada.')
  }
}

export async function applyCanonicalPayment(payment, order, options = {}) {
  const { repository, notifyPaymentApplied, auditTrail, stage = 'apply' } = options
  try {
    addBreadcrumb('payment.apply_started', {
      stage,
      orderId: order.id,
      externalPaymentId: payment?.id ? String(payment.id) : null,
      providerStatus: payment?.status ?? null,
      // Los dos valores que se comparan: si no coinciden, la falla siguiente
      // ya viene explicada por este paso.
      orderAmount: order.amount,
      paymentAmount: payment?.transaction_amount ?? null,
    })
    assertPaymentMatchesOrder(payment, order.id)
    const amount = Number(payment.transaction_amount)
    if (!Number.isInteger(amount) || amount !== order.amount) {
      throw new HttpError(409, 'Monto de pago invalido para la orden.')
    }
    if (String(payment.currency_id ?? '').toUpperCase() !== String(order.currency).toUpperCase()) {
      throw new HttpError(409, 'Moneda de pago invalida para la orden.')
    }

    const appliedPayment = {
      orderId: order.id,
      externalPaymentId: payment.id,
      status: mapMercadoPagoStatus(payment.status),
      amount,
      currency: payment.currency_id,
      payerEmail: payment.payer?.email ?? null,
      statusDetail: payment.status_detail ?? null,
      raw: payment,
    }
    // `orderKind` viaja aparte del contrato de notificacion: la orden ya se
    // resolvio y valido aca, y el repositorio la releia solo para elegir la RPC.
    const result = await repository.applyPayment({ ...appliedPayment, orderKind: order.kind })
    addBreadcrumb('payment.applied', {
      orderId: order.id,
      status: appliedPayment.status,
      resultOrderStatus: result?.order?.status ?? null,
    })
    await auditTrail?.record({
      action: PAYMENT_TRAIL_ACTIONS.applied,
      order,
      status: appliedPayment.status,
      severity: appliedPayment.status === 'aprobado' ? 'success' : 'info',
      externalPaymentId: payment.id,
      metadata: { stage, ...paymentTrailMetadata(payment) },
    })
    // El aviso se decide con el estado de la ORDEN, no con el del intento. Un
    // intento rechazado que se aplica después de que otro ya acreditó (MP
    // reenvía la notificación, o el pago pasa de `pending` a `rejected` horas
    // más tarde) no cambia el hecho para la persona: la orden sigue aprobada.
    // Sin esto, ese intento tardío le mandaba "no pudimos procesar tu pago" a
    // un socio que ya estaba activo.
    await notifyPaymentApplied?.({
      order,
      payment: appliedPayment,
      result,
      orderStatus: result?.order?.status ?? null,
    })
    return { appliedPayment, result }
  } catch (error) {
    // Punto unico donde se acredita: webhook, checkout embebido y conciliacion
    // pasan por aca, asi que este asiento cubre las tres entradas.
    await auditTrail?.recordFailure({
      stage,
      order,
      error,
      externalPaymentId: payment?.id ?? null,
      metadata: paymentTrailMetadata(payment),
    })
    throw error
  }
}

/**
 * El retorno del navegador no acredita por si solo: vuelve a consultar el
 * recurso canónico de Mercado Pago y aplica exactamente las mismas
 * validaciones que el webhook. Si MP todavía no expuso el pago, el cliente
 * puede quedar en espera sin inventar un estado de cobro.
 */
export async function reconcileReturnPayment(input, options = {}) {
  const { repository, mercadoPago, order, notifyPaymentApplied, auditTrail } = options
  if (!repository || !mercadoPago || !order?.id) {
    throw new HttpError(503, 'La conciliación de pagos no está configurada.')
  }

  const paymentId = input?.paymentId ?? input?.payment_id ?? null
  const payment = paymentId
    ? await mercadoPago.getPayment(paymentId)
    : await mercadoPago.findPaymentForOrder(order)

  if (!payment) return { reconciled: false, reason: 'payment_not_found' }

  const { appliedPayment, result } = await applyCanonicalPayment(payment, order, {
    repository,
    notifyPaymentApplied,
    auditTrail,
    stage: 'return',
  })

  return { reconciled: true, payment: appliedPayment, ...result }
}

/**
 * Reusa el email `payment_rejected` (mismo copy: "no pudimos procesar tu
 * pago... reintenta") para dos eventos de suscripcion que hasta ahora no
 * avisaban a nadie. No inventa un template nuevo -- necesitaria su propia
 * variable BREVO_TEMPLATE_* que todavia no existe -- ni una politica de
 * reintentos/cancelacion automatica: eso es una decision de producto, no
 * el hallazgo puntual de esta auditoria.
 */
async function notifySubscriptionChargeFailed(authorizedPayment, result, { notifyPaymentApplied }) {
  if (!notifyPaymentApplied) return
  const order = result?.order
  if (!order?.payer_email) return
  await notifyPaymentApplied({
    order: {
      id: order.id,
      kind: 'athlete',
      payerEmail: order.payer_email,
      concept: order.concept,
      displayConcept: displayPaymentConcept(order.concept),
      reference: order.reference,
    },
    payment: {
      status: 'rechazado',
      amount: Number(authorizedPayment.transaction_amount),
      statusDetail:
        authorizedPayment.status_detail || 'Cobro recurrente rechazado por el medio de pago.',
      externalPaymentId: String(authorizedPayment.payment_id ?? authorizedPayment.id),
      payerEmail: order.payer_email,
    },
  })
}

async function notifySubscriptionCancelled(subscription, { repository, notifyPaymentApplied }) {
  if (!notifyPaymentApplied || !repository.getOrder) return
  const order = await repository.getOrder(subscription.initial_order_id).catch(() => null)
  if (!order?.payerEmail) return
  await notifyPaymentApplied({
    order,
    payment: {
      status: 'rechazado',
      amount: order.amount,
      statusDetail:
        'Tu suscripcion fue cancelada en Mercado Pago. No se va a renovar automaticamente.',
      // Estable por suscripcion: si MP reenvia el mismo evento de cancelacion
      // no dispara un segundo aviso.
      externalPaymentId: `subscription-cancelled:${subscription.id}`,
      payerEmail: order.payerEmail,
    },
  })
}

export async function processClaimedPaymentEvent(event, options = {}) {
  const { repository, mercadoPago, notifyPaymentApplied, auditTrail } = options
  const resourceId = event.resource_id ?? event.resourceId
  const type = event.event_type ?? event.eventType
  if (!resourceId || !type) throw new HttpError(409, 'Evento de pago incompleto.')

  addBreadcrumb('webhook.event_claimed', {
    eventId: event.id,
    type,
    resourceId: String(resourceId),
    attempts: event.attempts_count ?? null,
  })

  try {
    let result
    if (type === 'payment') {
      const payment = await mercadoPago.getPayment(resourceId)
      addBreadcrumb('mp.payment_fetched', {
        externalPaymentId: String(payment.id),
        providerStatus: payment.status,
        externalReference: payment.external_reference ?? null,
      })
      const orderId = payment.external_reference
      if (!orderId) throw new HttpError(409, 'Pago sin referencia de orden.')
      const order = await repository.getOrder(orderId)
      result = (
        await applyCanonicalPayment(payment, order, {
          repository,
          notifyPaymentApplied,
          auditTrail,
          stage: 'webhook',
        })
      ).result
    } else if (type === 'subscription_preapproval') {
      const subscription = await mercadoPago.getSubscription(resourceId)
      result = await repository.applySubscription?.(subscription)
      if (!result) {
        result = { ignored: true, reason: 'subscription_repository_unavailable' }
      } else if (result.status === 'cancelled') {
        // Hasta aca una suscripcion cancelada en Mercado Pago no le avisaba a
        // nadie: la membresia seguia activa "pagada hasta fin de periodo" sin
        // que el socio supiera que no se va a renovar sola.
        await notifySubscriptionCancelled(result, { repository, notifyPaymentApplied })
      }
    } else if (type === 'subscription_authorized_payment') {
      const authorizedPayment = await mercadoPago.getAuthorizedPayment(resourceId)
      result = await repository.applyAuthorizedSubscriptionPayment?.(authorizedPayment)
      if (!result) {
        result = { ignored: true, reason: 'subscription_repository_unavailable' }
      } else if (mapMercadoPagoStatus(authorizedPayment.status) === 'rechazado') {
        // Mismo hueco que la cancelacion: un cobro recurrente rechazado (tarjeta
        // vencida, fondos insuficientes) solo tocaba billing_subscriptions.status
        // = 'past_due', sin avisarle al socio que tiene que actualizar el medio
        // de pago.
        await notifySubscriptionChargeFailed(authorizedPayment, result, { notifyPaymentApplied })
      }
    } else {
      throw new HttpError(400, 'Tipo de webhook no soportado.')
    }

    const completedEvent = await repository.markWebhookProcessed(event.id, result)
    await auditTrail?.record({
      action: PAYMENT_TRAIL_ACTIONS.webhookProcessed,
      entityType: 'payment_integration_event',
      entityId: event.id,
      status: 'processed',
      severity: 'success',
      externalPaymentId: resourceId,
      metadata: { eventType: type, attempts: event.attempts_count ?? null },
    })
    return { event: completedEvent, result }
  } catch (error) {
    // La columna `error` se queda con el resumen accionable (codigo del
    // catalogo + requestId): es lo que ve el operador en el panel. El stack
    // completo va al asiento de auditoria y al log; el error original viaja
    // como `cause` para cualquier repositorio que quiera inspeccionarlo.
    await repository.markWebhookFailed(
      event.id,
      new Error(summarizeFailure(error, { stage: 'webhook' }), { cause: error }),
    )
    await auditTrail?.recordFailure({
      action: PAYMENT_TRAIL_ACTIONS.webhookFailed,
      stage: 'webhook',
      entityType: 'payment_integration_event',
      entityId: event.id,
      externalPaymentId: resourceId,
      error,
      metadata: { eventType: type, attempts: event.attempts_count ?? null },
    })
    throw error
  }
}

export async function processPaymentWebhook(input, options = {}) {
  const {
    repository,
    mercadoPago,
    webhookSecret,
    toleranceSeconds,
    notifyPaymentApplied,
    auditTrail,
    deferProcessing = false,
  } = options
  if (!repository || !mercadoPago) {
    throw new HttpError(503, 'El workflow de pagos no esta configurado.')
  }

  const body = input.body ?? {}
  const queryDataId = input.query?.['data.id'] ?? input.query?.data_id
  const bodyDataId = body.data?.id
  const providerRequestId = input.headers?.['x-request-id'] ?? null

  // Una notificacion rechazada antes de persistirse no dejaba ningun rastro:
  // ni en el inbox (todavia no existe la fila) ni en el log. Este asiento es
  // el unico registro de firmas invalidas y payloads mal formados.
  //
  // `signature` viaja en el asiento de un rechazo por firma porque sin eso el
  // rechazo no se puede diagnosticar: "firma invalida" tiene tres causas que se
  // arreglan en lugares distintos -- el secreto es de otra aplicacion de MP, el
  // header `x-request-id` no llego (el manifiesto es
  // `id:…;request-id:…;ts:…;`, asi que sin ese valor el HMAC nunca coincide), o
  // el reloj quedo fuera de tolerancia. El HMAC y el ts son publicos: viajan en
  // claro en el header que manda MP, no son material secreto.
  const signatureDiagnosis = () => {
    const raw = input.headers?.['x-signature']
    if (!raw) return { present: false }
    const parts = Object.fromEntries(
      String(raw)
        .split(',')
        .map((chunk) => chunk.split('=').map((piece) => piece.trim()))
        .filter((pair) => pair.length === 2),
    )
    return {
      present: true,
      ts: parts.ts ?? null,
      // Los primeros caracteres alcanzan para comparar dos corridas entre si
      // sin volcar el hash entero en la bitacora.
      v1Prefix: parts.v1 ? String(parts.v1).slice(0, 8) : null,
      requestIdPresent: Boolean(providerRequestId),
      // Con la unidad del `ts` detectada, no asumida: MP documenta segundos y
      // el SDK asumia milisegundos (ver webhookVerifier.js) — este diagnostico
      // repetia el mismo error y reportaba corrimientos de ~54 anios.
      skewSeconds: parts.ts ? webhookTimestampSkewSeconds(parts.ts) : null,
    }
  }

  const rejectWebhook = async (error, reason) => {
    await auditTrail?.recordFailure({
      action: PAYMENT_TRAIL_ACTIONS.webhookFailed,
      stage: 'webhook_intake',
      entityType: 'payment_integration_event',
      entityId: String(queryDataId ?? bodyDataId ?? 'unknown'),
      error,
      metadata: {
        reason,
        providerRequestId,
        notificationType: body.type ?? null,
        ...(reason === 'signature_rejected' ? { signature: signatureDiagnosis() } : {}),
      },
    })
    throw error
  }

  // Notificacion IPN: el formato viejo de Mercado Pago, que sigue enviandose
  // cuando la cuenta tiene la seccion IPN configurada ademas de (o en vez de)
  // Webhooks. Llega como `?topic=payment&id=123` y SIN `x-signature`: MP no
  // firma las IPN, asi que exigirle el manifiesto HMAC las rechazaba todas.
  //
  // En produccion eso dejaba la tabla `payment_integration_events` vacia: cada
  // acreditacion dependia de que el atleta volviera del checkout con la pestana
  // abierta. El que pagaba en efectivo, por transferencia desde MP o cerraba el
  // navegador se quedaba con la orden en `pendiente` hasta que el cron la
  // cancelaba, con la plata ya adentro.
  //
  // Aceptarlas es seguro porque el payload no decide nada: `processClaimedPaymentEvent`
  // usa el id solo para preguntarle a la API de MP (server-to-server, con
  // nuestro token) y acredita contra esa respuesta, revalidando referencia,
  // monto y moneda. Un id inventado devuelve 404 o un pago de otra orden, y en
  // los dos casos muere en `assertPaymentMatchesOrder`. Lo unico que un tercero
  // consigue es gastarnos una consulta, y para eso esta el rate limit de la ruta.
  const ipnTopic = String(input.query?.topic ?? body.topic ?? '').trim()
  const ipnId = input.query?.id ?? null
  const isIpn = !queryDataId && Boolean(ipnTopic) && Boolean(ipnId)

  if (!queryDataId && !isIpn) {
    await rejectWebhook(new HttpError(400, 'Webhook sin data.id en la URL.'), 'missing_data_id')
  }
  if (queryDataId && bodyDataId && String(queryDataId) !== String(bodyDataId)) {
    await rejectWebhook(
      new HttpError(400, 'El identificador del webhook no coincide.'),
      'data_id_mismatch',
    )
  }
  const resourceId = queryDataId ?? ipnId

  if (isIpn) {
    addBreadcrumb('webhook.ipn_received', {
      topic: ipnTopic,
      resourceId: String(resourceId),
      providerRequestId,
    })
  } else {
    try {
      verifyMercadoPagoWebhook({
        xSignature: input.headers?.['x-signature'],
        xRequestId: providerRequestId,
        dataId: resourceId,
        secret: webhookSecret,
        toleranceSeconds,
      })
      addBreadcrumb('webhook.signature_verified', {
        resourceId: String(resourceId),
        providerRequestId,
      })
    } catch (error) {
      await rejectWebhook(error, 'signature_rejected')
    }
  }

  // El vocabulario de IPN es `topic`; el de Webhooks, `type`. `merchant_order`
  // no se traduce a ningun tipo procesable: la orden comercial no es el cobro, y
  // el pago que la compone llega por su propia notificacion.
  const type = isIpn
    ? IPN_TOPIC_TO_EVENT_TYPE[ipnTopic] ?? ipnTopic
    : String(input.query?.type ?? body.type ?? '')
  if (!['payment', 'subscription_preapproval', 'subscription_authorized_payment'].includes(type)) {
    // Descarte deliberado, y por eso un 200 y no un 400: para Mercado Pago un
    // 4xx es una entrega fallida que reintenta con backoff y computa contra la
    // salud del webhook. Cada checkout genera su `merchant_order`, asi que
    // rechazarla llenaba la bitacora de "errores" que no eran errores y hacia
    // reintentar N veces algo que jamas se iba a procesar. El asiento queda en
    // la auditoria como descarte, no como falla.
    addBreadcrumb('webhook.discarded', {
      reason: 'unsupported_type',
      notificationType: type,
      resourceId: String(resourceId ?? 'unknown'),
      providerRequestId,
    })
    await auditTrail?.record({
      action: PAYMENT_TRAIL_ACTIONS.webhookDiscarded,
      entityType: 'payment_integration_event',
      entityId: String(resourceId ?? 'unknown'),
      status: 'skipped',
      externalPaymentId: resourceId ? String(resourceId) : null,
      metadata: {
        reason: 'unsupported_type',
        notificationType: type,
        topic: isIpn ? ipnTopic : null,
        providerRequestId,
        // El panel muestra este asiento bajo "Qué falló": sin el diagnóstico,
        // `unsupported_type` pelado se leía como un pago rechazado.
        diagnosis: describeWebhookDiscard(type),
      },
    })
    return { accepted: true, ignored: true, reason: 'unsupported_type', type }
  }

  // La IPN no trae `id`/`action`/`date_created` en el body -- suele venir vacio
  // --, asi que la clave de idempotencia se arma con lo unico estable que tiene:
  // topic y recurso. Dos avisos del mismo pago colapsan en la misma fila, que es
  // justamente lo que evita acreditar dos veces.
  const notificationId = isIpn ? `ipn:${ipnTopic}:${resourceId}` : notificationKey(body)
  if (!notificationId) {
    await rejectWebhook(
      new HttpError(400, 'Webhook sin identificador de notificacion.'),
      'missing_notification_id',
    )
  }

  const recorded = await repository.recordWebhook({
    notificationId,
    resourceId: String(resourceId),
    type,
    action: body.action,
    requestId: providerRequestId,
    payload: body,
    signatureValid: !isIpn,
  })

  await auditTrail?.record({
    action: PAYMENT_TRAIL_ACTIONS.webhookReceived,
    entityType: 'payment_integration_event',
    entityId: recorded.event.id,
    status: recorded.event.status,
    externalPaymentId: resourceId,
    metadata: {
      eventType: type,
      notificationAction: body.action ?? null,
      providerRequestId,
      created: recorded.created,
    },
  })

  if (recorded.event.status === 'processed') {
    return { duplicate: true, event: recorded.event }
  }

  // Con el worker activo confirmamos la recepcion apenas el evento queda
  // persistido. Mercado Pago no necesita esperar la consulta canonica ni los
  // efectos de dominio; la bandeja durable garantiza que se procesen despues.
  if (deferProcessing) {
    return { accepted: true, deferred: true, duplicate: !recorded.created, event: recorded.event }
  }

  const claimedEvent = repository.claimWebhookEvent
    ? await repository.claimWebhookEvent(recorded.event.id)
    : recorded.event
  if (!claimedEvent) {
    return { duplicate: true, inFlight: true, event: recorded.event }
  }

  const processed = await processClaimedPaymentEvent(claimedEvent, {
    repository,
    mercadoPago,
    notifyPaymentApplied,
    auditTrail,
  })
  return { duplicate: !recorded.created, ...processed }
}
