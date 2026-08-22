/**
 * stateCoherenceService.js — PLU ARG
 *
 * Contesta una sola pregunta, y la contesta igual para toda la app:
 * ¿el estado que muestra esta pantalla coincide con el cobro que lo respalda, y
 * si no coincide, por qué?
 *
 * El caso que lo originó: una ficha de atleta con "Afiliación: Activa" en un tab
 * y "Afiliación anual: Cancelado" dos tabs más allá. Las dos cosas eran ciertas
 * -- la orden de Mercado Pago venció sin que entrara un peso, y un operador
 * activó la afiliación a mano cuatro horas después porque la plata había llegado
 * por transferencia -- pero la pantalla mostraba los dos hechos sin el tercero
 * que los une, así que se leía como un bug del sistema.
 *
 * Al escribirse esto había 3 afiliaciones y 3 inscripciones en ese estado sobre
 * 42 filas de dominio. No es un borde: es cómo la organización resuelve los
 * cobros que se caen.
 *
 * Es puro y no traduce: devuelve códigos y datos para que la UI los pase por
 * i18n. La derivación del estado del cobro no se duplica acá -- sale de
 * `derivePaymentProgress`, que ya es el único lugar que la sabe.
 */

/** Estados de dominio en los que el derecho está efectivamente otorgado. */
const GRANTED_STATUSES = new Set(['activa', 'confirmada', 'pagada'])

/** Estado de orden que respalda un derecho sin necesidad de explicación. */
const SETTLED_ORDER_STATUS = 'aprobado'

/**
 * Códigos de cierre que ya explican, por sí solos, por qué el derecho está
 * otorgado con el cobro cerrado. `resolved_off_platform` es el sello que deja la
 * activación manual (ver 20260910100000): la divergencia sigue existiendo, pero
 * está declarada.
 */
const EXPLAINED_CLOSURE_CODES = new Set(['resolved_off_platform'])

function orderOf(payments, orderId) {
  if (!orderId) return null
  return payments.find((payment) => payment.id === orderId) ?? null
}

/**
 * La orden que respalda un derecho, sin importar su estado actual. A
 * diferencia de `resolveEntitlementBacking` (que solo mira derechos ya
 * otorgados) esta sirve para el caso inverso: una afiliación o inscripción
 * que sigue `cancelada`/`pendiente` porque su orden quedó así, y hay que poder
 * revalidarla o acreditarla a mano sin salir de la lista.
 */
export function findEntitlementOrder(entity, payments = []) {
  return orderOf(payments, entity?.paymentOrderId)
}

/**
 * ¿Este derecho está otorgado sin un cobro que lo respalde?
 *
 * `explained` distingue lo que hay que ir a corregir de lo que ya tiene su
 * motivo escrito. Sin esa distinción, la pantalla o alarma por todo (y se
 * ignora) o no alarma por nada (y el caso sin explicación se pierde entre los
 * legítimos).
 *
 * @param {{ status?: string, paymentOrderId?: string|null, manualOverride?: object|null }} entity
 * @param {Array<object>} payments
 */
export function resolveEntitlementBacking(entity, payments = []) {
  if (!entity || !GRANTED_STATUSES.has(entity.status)) return null

  const order = orderOf(payments, entity.paymentOrderId)
  const manualOverride = entity.manualOverride ?? null

  // Sin orden vinculada no hay nada que contradecir: es una afiliación cargada a
  // mano de entrada, no una divergencia entre dos hechos.
  if (!order) {
    return {
      diverges: false,
      order: null,
      manualOverride,
      backing: manualOverride ? 'manual' : 'none',
      explained: Boolean(manualOverride?.reason),
      closureCode: null,
    }
  }

  if (order.status === SETTLED_ORDER_STATUS) {
    return {
      diverges: false,
      order,
      manualOverride,
      backing: 'payment',
      explained: true,
      closureCode: null,
    }
  }

  const closureCode = order.cancellationCode ?? null

  return {
    diverges: true,
    order,
    manualOverride,
    backing: manualOverride ? 'manual' : 'unknown',
    // Explicado si alguien escribió el motivo del otorgamiento, o si el cierre
    // de la orden quedó sellado como resuelto por otra vía. Un motivo de
    // relleno ("Sin motivo registrado") NO cuenta: el backfill lo dejó a
    // propósito como un hueco visible, no como una explicación.
    explained:
      EXPLAINED_CLOSURE_CODES.has(closureCode) &&
      Boolean(manualOverride?.reason) &&
      !isPlaceholderReason(manualOverride.reason),
    closureCode,
  }
}

/**
 * El backfill de 20260910100000 no le inventó un motivo a las afiliaciones que
 * se activaron cuando la RPC no lo pedía. Ese texto es un pendiente, no una
 * explicación, y la pantalla tiene que poder tratarlo como tal.
 */
export function isPlaceholderReason(reason) {
  return typeof reason === 'string' && reason.startsWith('Sin motivo registrado')
}

/**
 * Todas las divergencias de un atleta, para la ficha.
 *
 * @param {{ memberships?: Array<object>, registrations?: Array<object>, payments?: Array<object> }} input
 * @returns {Array<{ kind: 'membership'|'registration', entity: object, backing: object }>}
 */
export function findAthleteStateDivergences({
  memberships = [],
  registrations = [],
  payments = [],
} = {}) {
  const divergences = []

  for (const [kind, rows] of [
    ['membership', memberships],
    ['registration', registrations],
  ]) {
    for (const entity of rows) {
      const backing = resolveEntitlementBacking(entity, payments)
      if (backing?.diverges) divergences.push({ kind, entity, backing })
    }
  }

  return divergences
}
