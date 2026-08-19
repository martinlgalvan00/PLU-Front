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
 * por canal: los dos dependen de que alguien valide el cobro a mano. El
 * interruptor de plataforma, en cambio, ya los controla por separado
 * (`platform_payment_channels`), así que esto sólo dice si el cobro necesita
 * validación humana — no si está habilitado.
 */
export function isManualPaymentMethod(paymentMethod) {
  return manualPaymentChannel(paymentMethod) !== null
}

/**
 * Medio de pago elegido -> celda de la matriz de canales. Mercado Pago es el
 * caso restante: ya no por ser incondicional, sino porque es el único canal no
 * manual del checkout.
 */
export function paymentChannelOf(paymentMethod) {
  return manualPaymentChannel(paymentMethod) ?? 'mercado_pago'
}
