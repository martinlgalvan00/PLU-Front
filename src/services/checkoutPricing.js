/**
 * La UI llama `transferencia` a lo que la API llama `manual_link`. Todo lo que
 * viaje al backend tiene que ir traducido: el preview de un cupón calculado
 * sobre el canal equivocado le muestra al atleta un ahorro que después no se
 * cumple.
 */
export function toApiPaymentMethod(paymentMethod) {
  if (paymentMethod === 'transferencia') return 'manual_link'
  if (paymentMethod === 'mercado_pago' || paymentMethod === 'cash_pitbull') return paymentMethod
  if (paymentMethod === 'manual_link') return 'manual_link'
  return null
}

/**
 * Sólo previsualización — la API vuelve a resolver el precio contra el plan/
 * evento/combo antes de crear la orden, nunca confía en este cálculo. `manualPrice`
 * es el precio de transferencia/efectivo del plan/evento/combo que ya está
 * cargado en pantalla (`null` = cobra igual que `fallback` en cualquier canal).
 */
export function previewCheckoutPrice({ paymentMethod, manualPrice, fallback }) {
  const isManualChannel =
    paymentMethod === 'manual_link' || paymentMethod === 'transferencia' || paymentMethod === 'cash_pitbull'
  if (isManualChannel && manualPrice != null) return manualPrice
  return fallback
}
