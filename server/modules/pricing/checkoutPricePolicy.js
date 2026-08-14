// Política temporal Pitbull 2026. El monto definitivo se calcula sólo en la
// API, antes de inicializar Mercado Pago o entregar una orden manual.
export const PITBULL_PRE_SALE_END = new Date('2026-08-29T03:00:00.000Z')

export function storagePaymentMethod(paymentMethod) {
  return paymentMethod === 'cash_pitbull' ? 'manual_link' : paymentMethod
}

export function manualPaymentChannel(paymentMethod) {
  if (paymentMethod === 'cash_pitbull') return 'cash_pitbull'
  if (paymentMethod === 'manual_link') return 'bank_transfer'
  return null
}

/**
 * Transferencia y efectivo comparten `method = 'manual_link'` y se distinguen
 * por canal: los dos dependen de que alguien valide el cobro a mano, así que el
 * interruptor de canal manual los cubre juntos.
 */
export function isManualPaymentMethod(paymentMethod) {
  return manualPaymentChannel(paymentMethod) !== null
}

export function checkoutPriceFor({ concept, paymentMethod, now = new Date() }) {
  if (now >= PITBULL_PRE_SALE_END) return null
  const bankTransfer = paymentMethod === 'manual_link'
  const cashAtPitbull = paymentMethod === 'cash_pitbull'
  // La promo de combo vale para los dos canales manuales: transferencia y
  // efectivo en Pitbull. Antes el efectivo pagaba 150000 —la suma sin descuento—
  // y quedaba peor que transferir, sin que nadie lo hubiera decidido así.
  if (concept === 'combo') return bankTransfer || cashAtPitbull ? 120000 : 170000
  if (concept === 'membership' || concept === 'registration') {
    return bankTransfer || cashAtPitbull ? 75000 : 85000
  }
  return null
}
