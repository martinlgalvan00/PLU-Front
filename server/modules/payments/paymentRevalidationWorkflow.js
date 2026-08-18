import { HttpError } from '../../lib/errors.js'
import { mapWithConcurrency } from '../../lib/concurrency.js'
import { addBreadcrumb, logger } from '../../lib/logger.js'
import { PAYMENT_TRAIL_ACTIONS } from './paymentAuditTrail.js'
import { applyCanonicalPayment, mapMercadoPagoStatus } from './paymentWorkflow.js'
import {
  selectCanonicalProviderPayment,
  sortProviderPaymentsChronologically,
} from './providerPaymentSelection.js'

/**
 * paymentRevalidationWorkflow.js — PLU ARG
 *
 * Vuelve a preguntarle a Mercado Pago que paso con una orden y corrige el
 * estado local con lo que contesta el proveedor.
 *
 * Por que hace falta: hasta aca el estado de una orden solo se movia si algo
 * nos llegaba —el webhook, el retorno del navegador o el intento embebido con
 * su conciliacion—. Cuando esas tres entradas fallan a la vez (la notificacion
 * nunca llego porque la URL estaba mal configurada, el atleta cerro la pestaña
 * antes de volver, y el pago se hizo por el checkout redirigido asi que no hay
 * `embedded_payment_attempts` que conciliar) la orden se queda con el ultimo
 * estado conocido —`pendiente`, `rechazado` o `cancelado`— mientras la plata ya
 * entro. Ni `recoverPaymentOperations` ni el job de recuperacion lo detectan:
 * los dos drenan colas de cosas que SI llegaron.
 *
 * Es distinto de `staff_force_settle_payment_order`: aquello acredita a mano
 * contra un comprobante porque el proveedor no confirma nada. Esto no inventa
 * ningun cobro — relee la verdad del proveedor y aplica exactamente el mismo
 * camino canonico que el webhook (`applyCanonicalPayment`), con sus
 * validaciones de monto, moneda y `external_reference`. Si Mercado Pago no
 * tiene un pago aprobado, no acredita nada.
 */

const DEFAULT_CONCURRENCY = 4

function describeOrder(order) {
  return {
    id: order.id,
    kind: order.kind,
    concept: order.concept ?? null,
    reference: order.reference ?? null,
    amount: order.amount ?? null,
    currency: order.currency ?? null,
    athleteId: order.athleteId ?? null,
    athleteName: order.athlete?.full_name ?? null,
    payerEmail: order.payerEmail ?? null,
  }
}

function summarizeProviderPayment(payment) {
  const amount = Number(payment?.transaction_amount)
  return {
    id: String(payment?.id ?? ''),
    providerStatus: payment?.status ?? null,
    status: mapMercadoPagoStatus(payment?.status),
    statusDetail: payment?.status_detail ?? null,
    amount: Number.isFinite(amount) ? amount : null,
    currency: payment?.currency_id ?? null,
    dateCreated: payment?.date_created ?? null,
    dateApproved: payment?.date_approved ?? null,
  }
}

async function listProviderPayments(mercadoPago, order) {
  if (typeof mercadoPago.searchPaymentsForOrder === 'function') {
    return (await mercadoPago.searchPaymentsForOrder(order)) ?? []
  }
  // Adaptadores viejos o dobles de test que solo exponen el canonico.
  const canonical = await mercadoPago.findPaymentForOrder?.(order)
  return canonical ? [canonical] : []
}

/**
 * Un pago cuyo monto o moneda no coinciden con la orden no se aplica: es la
 * misma guarda que corta en `applyCanonicalPayment`, pero acá se reporta como
 * hallazgo en vez de como excepción, porque en una revalidación masiva un caso
 * así no es una falla del barrido — es exactamente lo que hay que mirar a mano.
 */
function matchesOrderAmount(payment, order) {
  const amount = Number(payment?.transaction_amount)
  return (
    Number.isInteger(amount) &&
    amount === order.amount &&
    String(payment?.currency_id ?? '').toUpperCase() === String(order.currency).toUpperCase()
  )
}

/**
 * Revalida una orden contra Mercado Pago.
 *
 * `apply: false` deja el diagnostico sin tocar nada — es lo que usa el barrido
 * del panel para listar divergencias antes de que alguien decida corregirlas.
 */
export async function revalidatePaymentOrder(target, options = {}) {
  const {
    repository,
    mercadoPago,
    notifyPaymentApplied,
    auditTrail,
    apply = true,
    actor = null,
  } = options
  if (!repository || !mercadoPago) {
    throw new HttpError(503, 'La revalidacion de pagos no esta configurada.')
  }

  const order = typeof target === 'string' ? await repository.getOrder(target) : target
  if (!order?.id) throw new HttpError(404, 'Orden no encontrada.')
  if (order.method !== 'mercado_pago') {
    throw new HttpError(409, 'La orden no se cobra por Mercado Pago.')
  }

  const localStatus = order.status
  addBreadcrumb('payment.revalidation_started', {
    orderId: order.id,
    kind: order.kind,
    localStatus,
    apply,
  })

  let providerPayments
  try {
    providerPayments = await listProviderPayments(mercadoPago, order)
  } catch (error) {
    await auditTrail?.recordFailure({
      stage: 'revalidation',
      order,
      error,
      metadata: { actor, localStatus },
    })
    throw error
  }

  const canonical = selectCanonicalProviderPayment(providerPayments)
  const providerStatus = canonical ? mapMercadoPagoStatus(canonical.status) : null
  const payments =
    sortProviderPaymentsChronologically(providerPayments).map(summarizeProviderPayment)

  const base = {
    order: describeOrder(order),
    localStatus,
    providerStatus,
    providerPayments: payments,
    resultStatus: localStatus,
    applied: false,
    corrected: false,
  }

  // El proveedor no conoce ningun pago para esta orden. No es una divergencia:
  // es un checkout que nunca se completo.
  if (!canonical) {
    await auditTrail?.record({
      action: PAYMENT_TRAIL_ACTIONS.revalidated,
      order,
      status: localStatus,
      metadata: { stage: 'revalidation', actor, outcome: 'no_provider_payment', localStatus },
    })
    return { ...base, divergent: false, outcome: 'no_provider_payment' }
  }

  const divergent = providerStatus !== localStatus
  const applicable = providerPayments.filter((payment) => matchesOrderAmount(payment, order))
  const mismatched = providerPayments.length > 0 && applicable.length === 0

  if (!apply || !divergent) {
    const outcome = mismatched ? 'amount_mismatch' : divergent ? 'divergent' : 'in_sync'
    await auditTrail?.record({
      action: divergent
        ? PAYMENT_TRAIL_ACTIONS.revalidationMismatch
        : PAYMENT_TRAIL_ACTIONS.revalidated,
      order,
      status: providerStatus,
      severity: divergent ? 'warning' : 'info',
      externalPaymentId: canonical.id,
      metadata: {
        stage: 'revalidation',
        actor,
        outcome,
        localStatus,
        providerStatus,
        dryRun: !apply,
      },
    })
    return { ...base, divergent, outcome }
  }

  if (mismatched) {
    // Cobro real por un importe distinto al de la orden (cambio de tarifa,
    // pago parcial, cupon aplicado despues). Aplicarlo mentiria en el reporte
    // financiero; se reporta para revision manual.
    await auditTrail?.record({
      action: PAYMENT_TRAIL_ACTIONS.revalidationMismatch,
      order,
      status: providerStatus,
      severity: 'warning',
      externalPaymentId: canonical.id,
      metadata: {
        stage: 'revalidation',
        actor,
        outcome: 'amount_mismatch',
        localStatus,
        providerStatus,
        orderAmount: order.amount,
        providerAmount: Number(canonical.transaction_amount) || null,
      },
    })
    return { ...base, divergent: true, outcome: 'amount_mismatch' }
  }

  // Se aplica **solo** el pago canonico, no todos los intentos que devolvio la
  // busqueda. Los otros son reintentos viejos que nunca se registraron de este
  // lado: aplicarlos no cambiaria el estado de la orden (la base lo recalcula
  // sobre todas las filas y el canonico ya manda) y en cambio dispararia el
  // aviso de "no pudimos procesar tu pago" por un rechazo de hace semanas.
  const applications = []
  let resultStatus = localStatus
  const settled = applicable.includes(canonical)
    ? canonical
    : selectCanonicalProviderPayment(applicable)
  try {
    const { result } = await applyCanonicalPayment(settled, order, {
      repository,
      // Un cobro que aparece ahora si merece el aviso: el socio nunca lo
      // recibio. Un rechazo viejo, no — llegaria fuera de tiempo y mandaria a
      // reintentar un pago que ya no corresponde.
      notifyPaymentApplied:
        mapMercadoPagoStatus(settled.status) === 'aprobado' ? notifyPaymentApplied : undefined,
      auditTrail,
      stage: 'revalidation',
    })
    resultStatus = result?.order?.status ?? resultStatus
    applications.push({ id: String(settled.id), applied: true })
  } catch (error) {
    // Que no se pueda aplicar (el pago ya pertenece a otra orden, por ejemplo)
    // es un hallazgo del barrido, no una falla que lo corte: se reporta con la
    // orden intacta.
    logger.warn('payment.revalidation_apply_failed', {
      orderId: order.id,
      externalPaymentId: String(settled.id),
      err: error,
    })
    applications.push({
      id: String(settled.id),
      applied: false,
      error: error?.message ?? String(error),
    })
  }

  const corrected = resultStatus !== localStatus
  await auditTrail?.record({
    action: PAYMENT_TRAIL_ACTIONS.revalidated,
    order,
    status: resultStatus,
    // Corregir un estado con la verdad del proveedor es sano, pero que hiciera
    // falta no lo es: queda en `warning` para que salte en la bitacora.
    severity: corrected ? 'warning' : 'info',
    externalPaymentId: canonical.id,
    metadata: {
      stage: 'revalidation',
      actor,
      outcome: corrected ? 'corrected' : 'unchanged',
      localStatus,
      providerStatus,
      resultStatus,
      applications,
    },
  })

  return {
    ...base,
    divergent: true,
    applied: applications.some((item) => item.applied),
    corrected,
    resultStatus,
    applications,
    outcome: corrected ? 'corrected' : 'unchanged',
  }
}

/**
 * Barrido: revalida las ordenes de Mercado Pago que todavia no estan aprobadas
 * y devuelve las que difieren de lo que dice el proveedor.
 */
export async function revalidatePaymentOrders(options = {}) {
  const {
    repository,
    mercadoPago,
    notifyPaymentApplied,
    auditTrail,
    apply = false,
    actor = null,
    statuses,
    sinceDays = 30,
    limit = 25,
    concurrency = DEFAULT_CONCURRENCY,
  } = options
  if (!repository || !mercadoPago) {
    throw new HttpError(503, 'La revalidacion de pagos no esta configurada.')
  }
  if (typeof repository.listOrdersForRevalidation !== 'function') {
    throw new HttpError(503, 'El repositorio de pagos no expone ordenes para revalidar.')
  }

  const startedAt = Date.now()
  const candidates = await repository.listOrdersForRevalidation({ statuses, sinceDays, limit })

  const outcomeResults = await mapWithConcurrency(candidates, concurrency, async (candidate) => {
    try {
      // Se relee la orden completa: `listOrdersForRevalidation` trae lo justo
      // para elegir candidatas, y `applyCanonicalPayment` necesita el contrato
      // completo (kind, concepto, email del pagador).
      return await revalidatePaymentOrder(candidate.id, {
        repository,
        mercadoPago,
        notifyPaymentApplied,
        auditTrail,
        apply,
        actor,
      })
    } catch (error) {
      return {
        order: { id: candidate.id, kind: candidate.kind, reference: candidate.reference ?? null },
        localStatus: candidate.status,
        providerStatus: null,
        providerPayments: [],
        divergent: false,
        applied: false,
        corrected: false,
        outcome: 'failed',
        error: error?.message ?? String(error),
      }
    }
  })
  // El worker ya atrapa sus propios errores (arriba), asi que `mapWithConcurrency`
  // siempre devuelve resultados `fulfilled` acá; se desenvuelve el `.value`.
  const outcomes = outcomeResults.map((result) => result.value)

  const divergences = outcomes.filter((item) => item.divergent || item.outcome === 'failed')
  const summary = {
    apply,
    sinceDays,
    checked: outcomes.length,
    divergent: outcomes.filter((item) => item.divergent).length,
    corrected: outcomes.filter((item) => item.corrected).length,
    failed: outcomes.filter((item) => item.outcome === 'failed').length,
    amountMismatch: outcomes.filter((item) => item.outcome === 'amount_mismatch').length,
    durationMs: Date.now() - startedAt,
  }

  logger.info(PAYMENT_TRAIL_ACTIONS.revalidationSweep, { ...summary, actor })
  if (summary.checked > 0) {
    await auditTrail?.record({
      action: PAYMENT_TRAIL_ACTIONS.revalidationSweep,
      entityType: 'payment_revalidation',
      entityId: 'payment_revalidation',
      status: summary.divergent ? 'partial' : 'processed',
      severity: summary.divergent ? 'warning' : 'info',
      metadata: { ...summary, actor },
    })
  }

  return { summary, divergences, results: outcomes }
}
