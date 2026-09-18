/**
 * ticketSalesAggregation.js — PLU ARG
 *
 * Agregación PURA de ventas de entradas: recibe filas ya leídas de Supabase
 * (por `supabaseTicketRepository.js`) y sólo reduce. Sin `SECURITY DEFINER`,
 * sin RPC: el backend usa la service-role key y bypassea RLS, así que un
 * reporte de sólo lectura no tiene la razón de negocio (locks, idempotencia)
 * que sí justifica una RPC en las mutaciones de este dominio.
 *
 * Reglas de negocio que fijan estas funciones (no son arbitrarias):
 *
 * - Cantidad de entradas SIEMPRE cuenta `is_primary_credential = true` — el
 *   filtro va en el SELECT del repositorio, antes de llegar acá. Una compra
 *   de entrenador emite 2 credenciales por 1 sola entrada; contar todas las
 *   filas duplicaría "vendidas" en cuanto hubiera un tipo multi-credencial
 *   (el mismo bug que hoy tiene `get_event_ticket_availability`, que no
 *   filtra esto — no se toca esa función acá, sólo se evita repetir el bug).
 * - Plata SIEMPRE sale de `ticket_orders.amount` agrupado por `currency`,
 *   nunca de sumar `tickets.unit_price`: en una orden Wise los tickets
 *   quedan con el precio en ARS pero la orden vale en USD
 *   (`ticket_orders.currency`). Sumar unit_price cross-orden mezclaría
 *   monedas en silencio.
 * - El eje temporal es `created_at`, no `approved_at` — `approved_at` queda
 *   `null` en toda orden manual (sólo lo pueblan los paths de Mercado Pago),
 *   así que no sirve como fecha de acreditación para transferencia/efectivo/
 *   Wise.
 */

/**
 * `types`: `[{ id, name, quota }]` — tipos de entrada activos del evento.
 * `eventLimit`: `event_capacity_rules` (`scope='event', key=''`), `null` si
 * no hay tope.
 * `ticketRows`: `[{ ticket_type_id, status }]`, ya filtradas por
 * `is_primary_credential = true` en el SELECT.
 */
export function aggregateCapacity(types, eventLimit, ticketRows) {
  const byType = new Map(
    (types ?? []).map((type) => [
      type.id,
      { ticketTypeId: type.id, name: type.name, quota: type.quota ?? null, sold: 0, reserved: 0 },
    ]),
  )

  let totalSold = 0
  let totalReserved = 0

  for (const row of ticketRows ?? []) {
    // `reserved` ocupa cupo (pendiente_pago o pagada); `cancelada` no.
    const reserved = row.status !== 'cancelada'
    const sold = row.status === 'pagada'
    if (reserved) totalReserved += 1
    if (sold) totalSold += 1

    const bucket = byType.get(row.ticket_type_id)
    if (!bucket) continue
    if (reserved) bucket.reserved += 1
    if (sold) bucket.sold += 1
  }

  return {
    byType: [...byType.values()].map((bucket) => ({ ...bucket, pending: bucket.reserved - bucket.sold })),
    totals: {
      sold: totalSold,
      reserved: totalReserved,
      pending: totalReserved - totalSold,
      eventLimit: eventLimit ?? null,
      remaining: eventLimit == null ? null : Math.max(0, eventLimit - totalReserved),
    },
  }
}

/** Canal legible a partir de `provider`/`manual_payment_channel`. */
function channelKey(order) {
  if (order.provider !== 'manual') return 'mercado_pago'
  return order.manual_payment_channel ?? 'bank_transfer'
}

/**
 * `orderRows`: `[{ provider, manual_payment_channel, currency, amount,
 * created_at }]`, ya filtradas por `status = 'aprobado'` y por rango de
 * fechas en el SELECT.
 *
 * Nunca colapsa monedas distintas en un solo total: `byCurrency` devuelve un
 * total por cada `currency` que haya aparecido, y `byChannel` lleva su
 * propia `currency` en cada fila (Wise siempre queda en USD, separado).
 */
export function aggregateRevenue(orderRows) {
  const byCurrency = new Map()
  const byChannel = new Map()

  for (const order of orderRows ?? []) {
    const currency = order.currency ?? 'ARS'
    const amount = Number(order.amount) || 0

    const currencyBucket = byCurrency.get(currency) ?? { currency, amount: 0, orders: 0 }
    currencyBucket.amount += amount
    currencyBucket.orders += 1
    byCurrency.set(currency, currencyBucket)

    const key = channelKey(order)
    const channelId = `${key}:${currency}`
    const channelBucket = byChannel.get(channelId) ?? { key, currency, amount: 0, orders: 0 }
    channelBucket.amount += amount
    channelBucket.orders += 1
    byChannel.set(channelId, channelBucket)
  }

  return {
    byCurrency: [...byCurrency.values()],
    byChannel: [...byChannel.values()],
  }
}

function toDateKey(value) {
  return new Date(value).toISOString().slice(0, 10)
}

/**
 * `rows`: `[{ created_at }]` de tickets `pagada` + `is_primary_credential`,
 * ya acotadas al rango en el SELECT. Devuelve un valor por día entre
 * `fromISO` (inclusive) y `toISO` (exclusive) sin huecos, para que la
 * tendencia no salte días sin ventas.
 */
export function bucketByDay(rows, fromISO, toISO) {
  const counts = new Map()
  for (const row of rows ?? []) {
    const key = toDateKey(row.created_at)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const days = []
  const cursor = new Date(toDateKey(fromISO))
  const end = new Date(toDateKey(toISO))
  while (cursor < end) {
    const key = cursor.toISOString().slice(0, 10)
    days.push({ date: key, count: counts.get(key) ?? 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}
