/**
 * paymentValidationService.js — PLU ARG
 *
 * Reglas de "¿esta orden se puede validar y con qué evidencia?", en un solo
 * lugar.
 *
 * Antes cada pantalla las reimplementaba: Finanzas exigía comprobante abierto,
 * la ficha del atleta aprobaba a ciegas y la cola del dashboard armaba su
 * propio objeto de revisión dentro de `buildPendingActions`. Tres criterios
 * distintos sobre la misma acción — acreditar plata — con el agravante de que
 * el más laxo era el que no mostraba el comprobante.
 *
 * Acá viven la elegibilidad y el mapeo a la forma que consume
 * `PaymentValidationDialog`. El backend sigue siendo la última palabra:
 * `approve_athlete_payment_order` rechaza Mercado Pago, exige comprobante en
 * transferencia y sólo admite órdenes abiertas (ver docs/BUSINESS_RULES.md,
 * "Finanzas puede aprobar solamente métodos manuales"). Esto evita ofrecer una
 * acción que la base va a negar, no la reemplaza.
 */

/** Único método que Finanzas puede acreditar a mano. */
export const MANUAL_PAYMENT_METHOD = 'manual_link'

/** Efectivo en sede: se cobra en la puerta y no deja archivo adjunto. */
export const CASH_PAYMENT_CHANNEL = 'cash_pitbull'

/** Estados que todavía esperan una decisión operativa. */
export const OPEN_ORDER_STATUSES = Object.freeze(['pendiente', 'validacion_manual'])

function channelOf(order) {
  return order?.manualPaymentChannel ?? order?.manual_payment_channel ?? 'bank_transfer'
}

function proofPathOf(order) {
  const raw = order?.paymentProofPath ?? order?.payment_proof_path ?? null
  return typeof raw === 'string' ? raw.trim() || null : raw
}

export function isOpenOrder(order) {
  return OPEN_ORDER_STATUSES.includes(order?.status)
}

export function isManualOrder(order) {
  return order?.method === MANUAL_PAYMENT_METHOD
}

export function isCashOrder(order) {
  return isManualOrder(order) && channelOf(order) === CASH_PAYMENT_CHANNEL
}

export function hasPaymentProof(order) {
  return Boolean(proofPathOf(order))
}

/**
 * Órdenes que el botón de validar puede tocar. El efectivo entra sin archivo
 * porque la evidencia es el cobro presencial; la transferencia no, porque sin
 * comprobante la acreditación es indistinguible de regalar la afiliación.
 */
export function canValidateManualOrder(order) {
  if (!isManualOrder(order) || !isOpenOrder(order)) return false
  return isCashOrder(order) || hasPaymentProof(order)
}

/**
 * Órdenes que el flujo normal de validación ya no puede tocar pero todavía
 * tienen arreglo: un cobro de Mercado Pago que quedó rechazado o cancelado, o
 * una transferencia rechazada cuyo dinero terminó entrando igual. Son las
 * candidatas a acreditación manual — mismo criterio en Finanzas, Inscripciones
 * y Afiliaciones, para no ofrecer el botón donde el backend lo va a negar.
 */
export function canForceSettleOrder(order) {
  if (!order || order.status === 'aprobado') return false
  return order.method === 'mercado_pago' || order.status === 'rechazado'
}

/**
 * Con el interruptor de validación del concepto apagado no se acredita ni se
 * rechaza esa orden. El combo pesa en los dos: acredita afiliación e
 * inscripción en la misma transacción, así que alcanza uno congelado.
 */
export function canValidateConcept(concept, validationEnabled = {}) {
  if (concept === 'combo') {
    return validationEnabled.membership !== false && validationEnabled.registration !== false
  }
  return validationEnabled[concept] !== false
}

/**
 * Orden manual abierta de una inscripción. Es lo que habilita cobrar en la
 * puerta: la fila de check-in conoce su inscripción, no su orden.
 */
export function findOpenManualOrderForRegistration(payments = [], registration) {
  const orderId = registration?.paymentOrderId ?? registration?.payment_order_id ?? null
  if (!orderId) return null
  const order = payments.find((item) => item.id === orderId) ?? null
  return order && canValidateManualOrder(order) ? order : null
}

/**
 * Forma que consume `PaymentValidationDialog`. `subject`, `documentId` y
 * `detail` son lo que el operador cruza contra el comprobante antes de decidir;
 * el resto es la decisión previa, para no revalidar a ciegas algo ya rechazado.
 */
export function buildPaymentValidationItem(
  order,
  { athlete = null, detail = null, meta = null, mode = 'validate' } = {},
) {
  if (!order) return null
  return {
    mode,
    type: 'payment',
    paymentId: order.id,
    concept: order.concept ?? order.conceptType ?? null,
    hasProof: hasPaymentProof(order),
    cashAtPitbull: isCashOrder(order),
    paymentProofPath: proofPathOf(order),
    paymentProofUploadedAt:
      order.paymentProofUploadedAt ?? order.payment_proof_uploaded_at ?? null,
    subject: athlete?.fullName ?? athlete?.full_name ?? '—',
    documentId: athlete?.documentId ?? athlete?.document_id ?? null,
    detail,
    meta,
    notes: order.notes ?? null,
    rejectedBy: order.rejectedBy ?? order.rejected_by ?? null,
    rejectionReason: order.rejectionReason ?? order.rejection_reason ?? null,
    rejectedAt: order.rejectedAt ?? order.rejected_at ?? null,
  }
}
