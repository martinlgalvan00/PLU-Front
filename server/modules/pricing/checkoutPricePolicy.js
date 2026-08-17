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
