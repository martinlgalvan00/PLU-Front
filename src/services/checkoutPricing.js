// Es sólo la previsualización. La API repite esta política y es quien fija el
// importe persistido antes de iniciar Mercado Pago.
const PRE_SALE_END = new Date('2026-08-29T03:00:00.000Z')

/**
 * La UI llama `transferencia` a lo que la API llama `manual_link`. Todo lo que
 * viaje al backend tiene que ir traducido: el preview de un cupón calculado
 * sobre el canal equivocado le muestra al atleta un ahorro que después no se
 * cumple.
 */
export function toApiPaymentMethod(paymentMethod) {
  if (paymentMethod === 'transferencia') return 'manual_link'
  if (paymentMethod === 'mercado_pago' || paymentMethod === 'cash_pitbull' || paymentMethod === 'wise_transfer') {
    return paymentMethod
  }
  if (paymentMethod === 'manual_link') return 'manual_link'
  return null
}

/**
 * `null` para Wise: el precio se fija en USD por variable de entorno del
 * servidor (no expuesta al build del cliente), así que acá no hay nada real
 * que previsualizar. Mostrar el precio ARS de Mercado Pago sería directamente
 * incorrecto — la UI que llama debe mostrar un texto en vez de un monto
 * cuando esto devuelve `null` y el método es `wise_transfer`.
 */
export function previewCheckoutPrice({ concept, paymentMethod, fallback, now = new Date() }) {
  if (paymentMethod === 'wise_transfer') return null
  if (now >= PRE_SALE_END) return fallback
  const bankTransfer = paymentMethod === 'manual_link' || paymentMethod === 'transferencia'
  const cashAtPitbull = paymentMethod === 'cash_pitbull'
  if (concept === 'combo') return bankTransfer || cashAtPitbull ? 120000 : 170000
  if (concept === 'membership' || concept === 'registration') {
    return bankTransfer || cashAtPitbull ? 75000 : 85000
  }
  return fallback
}
