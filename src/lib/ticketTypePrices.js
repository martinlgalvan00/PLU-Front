/**
 * Precios por canal de un tipo de entrada — PLU ARG
 *
 * `price` es Mercado Pago (lista). `manualPrice` es transferencia/efectivo.
 * `wisePrice` es el USD propio para Wise. Vacío en los dos últimos = hereda:
 * cobra igual que Mercado Pago, o convierte el total en pesos.
 *
 * Vive en `lib/` porque lo comparten el mapper de Supabase, el payload de
 * guardado y el editor: si cada lado trata `''` / `0` / snake_case distinto,
 * el panel muestra un monto que el próximo Guardar borra.
 */

/** Entero cobrable, o `null` si el campo está vacío o no es un precio. */
export function optionalTicketChannelPrice(value) {
  if (value === '' || value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null
}

/**
 * Lee un monto opcional de una fila de catálogo. Acepta snake_case (Supabase)
 * y camelCase (un evento que ya pasó por el mapper): si sólo se mira una
 * forma, el roundtrip post-guardar reabre el draft vacío y el próximo upsert
 * escribe `null`.
 */
export function catalogPriceFromRow(row, snakeKey, camelKey) {
  if (!row || typeof row !== 'object') return null
  return optionalTicketChannelPrice(row[snakeKey] ?? row[camelKey])
}

export function normalizeTicketTypePrices(type = {}) {
  return {
    wisePrice: optionalTicketChannelPrice(type.wisePrice ?? type.wise_price),
    manualPrice: optionalTicketChannelPrice(type.manualPrice ?? type.manual_price),
  }
}

/**
 * Beneficios pagos habilitados sin USD propio. En checkout, si falta uno, toda
 * la orden Wise cae a conversión y el `wisePrice` del tipo no se usa.
 */
export function paidAddonsMissingWise(addons = []) {
  return (addons ?? []).filter((addon) => {
    if (!addon || addon.enabled === false) return false
    const price = Number(addon.price)
    if (!Number.isFinite(price) || price <= 0) return false
    return optionalTicketChannelPrice(addon.wisePrice ?? addon.wise_price) == null
  })
}
