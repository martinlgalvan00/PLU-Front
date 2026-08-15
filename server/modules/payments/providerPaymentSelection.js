/**
 * providerPaymentSelection.js — PLU ARG
 *
 * Una orden puede tener varios pagos en Mercado Pago: el atleta reintenta con
 * otra tarjeta, el primero queda `cancelled` por abandono y el segundo entra
 * `approved`. Todos comparten el mismo `external_reference` (el id de la orden),
 * asi que la busqueda del proveedor devuelve la lista completa y hay que elegir
 * cual manda.
 *
 * Elegir "el mas reciente" es incorrecto: el orden de `date_created` no dice
 * nada sobre cual cobro efectivamente entro, y un intento rechazado posterior
 * a uno aprobado dejaria la orden reportando un estado que no es cierto. El
 * criterio es el mismo que usa la base al recalcular el estado agregado de la
 * orden (`bool_or(status = 'aprobado')` en `apply_mercado_pago_payment`): si
 * hay un pago aprobado, ese es el estado de la orden.
 */

/** Mayor gana. Empata -> el mas reciente. */
const PROVIDER_STATUS_RANK = Object.freeze({
  approved: 5,
  refunded: 4,
  charged_back: 4,
  authorized: 3,
  in_process: 3,
  in_mediation: 3,
  pending: 3,
  rejected: 2,
  cancelled: 1,
})

export function providerPaymentRank(payment) {
  return PROVIDER_STATUS_RANK[String(payment?.status ?? '').toLowerCase()] ?? 0
}

function timestampOf(payment) {
  const raw = payment?.date_approved ?? payment?.date_last_updated ?? payment?.date_created ?? null
  const value = raw ? Date.parse(raw) : Number.NaN
  return Number.isNaN(value) ? 0 : value
}

/**
 * Pagos del proveedor ordenados del mas antiguo al mas nuevo. Se aplican en
 * ese orden para que el ledger local reproduzca la misma secuencia que vio
 * Mercado Pago (el estado agregado de la orden lo recalcula la base sobre
 * todas las filas, asi que el resultado final no depende del orden, pero la
 * bitacora si).
 */
export function sortProviderPaymentsChronologically(payments = []) {
  return [...payments].sort((a, b) => timestampOf(a) - timestampOf(b))
}

/** El pago que define el estado de la orden. `null` si no hay ninguno. */
export function selectCanonicalProviderPayment(payments = []) {
  let winner = null
  for (const payment of payments) {
    if (!payment) continue
    if (!winner) {
      winner = payment
      continue
    }
    const rank = providerPaymentRank(payment)
    const winnerRank = providerPaymentRank(winner)
    if (rank > winnerRank || (rank === winnerRank && timestampOf(payment) > timestampOf(winner))) {
      winner = payment
    }
  }
  return winner
}
