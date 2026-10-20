/**
 * Resumen de cobros de UN evento: lo que el organizador necesita para saber "cuánto
 * se vendió y qué falta validar" sin ver nada de los demás eventos.
 *
 * Vocabularios (distintos a propósito, vienen de dos tablas):
 * - entradas (`ticket_orders.status`): creado | pendiente | aprobado | rechazado | …
 * - inscripciones (`athlete_payment_orders.status`): pendiente | validacion_manual |
 *   aprobado | rechazado
 *
 * Los montos se agrupan por moneda: Wise cobra en USD y sumarlo con pesos daría un
 * número sin sentido.
 */
const TICKET_PENDING = new Set(['creado', 'pendiente'])
const REGISTRATION_PENDING = new Set(['pendiente', 'validacion_manual'])

function emptyBucket() {
  return { count: 0, amounts: {} }
}

function add(bucket, amount, currency) {
  bucket.count += 1
  const key = currency || 'ARS'
  bucket.amounts[key] = (bucket.amounts[key] ?? 0) + (Number(amount) || 0)
}

function summarize(rows, pendingStatuses) {
  const result = {
    approved: emptyBucket(),
    pending: emptyBucket(),
    rejected: emptyBucket(),
    other: emptyBucket(),
  }
  for (const { status, amount, currency } of rows) {
    if (status === 'aprobado') add(result.approved, amount, currency)
    else if (pendingStatuses.has(status)) add(result.pending, amount, currency)
    else if (status === 'rechazado') add(result.rejected, amount, currency)
    else add(result.other, amount, currency)
  }
  return result
}

export function summarizeEventPayments({ ticketOrders = [], registrationOrders = [] } = {}) {
  return {
    tickets: summarize(
      ticketOrders.map((row) => row?.order ?? row),
      TICKET_PENDING,
    ),
    registrations: summarize(registrationOrders, REGISTRATION_PENDING),
  }
}
