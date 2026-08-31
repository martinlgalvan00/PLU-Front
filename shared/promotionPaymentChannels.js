const MANUAL_PROMOTION_CHANNELS = new Set(['bank_transfer', 'cash_pitbull'])

/**
 * Un preview del frontend usa `valid`; la politica leida por Express usa
 * `found`. En ambos casos, una coincidencia convierte los medios declarados
 * por el codigo en una lista cerrada.
 */
export function promotionCodeHasChannelPolicy(policy) {
  return policy?.valid === true || policy?.found === true
}

export function promotionCodeAllowsChannel(policy, channel) {
  if (!promotionCodeHasChannelPolicy(policy)) return true
  if (channel === 'mercado_pago') return policy.mercadoPagoEnabled !== false
  if (MANUAL_PROMOTION_CHANNELS.has(channel)) {
    return Array.isArray(policy.manualChannels) && policy.manualChannels.includes(channel)
  }
  return false
}

/**
 * Sin codigo mandan los interruptores globales. Con codigo, Mercado Pago
 * necesita ademas seguir abierto globalmente; transferencia y efectivo solo
 * existen si el codigo los declara expresamente.
 */
export function resolvePromotionPaymentChannels({
  policy,
  mercadoPagoOpen = false,
  bankTransferOpen = false,
  cashPitbullOpen = false,
  wiseTransferOpen = false,
} = {}) {
  if (!promotionCodeHasChannelPolicy(policy)) {
    return {
      mercadoPago: mercadoPagoOpen,
      bankTransfer: bankTransferOpen,
      cashPitbull: cashPitbullOpen,
      wiseTransfer: wiseTransferOpen,
      restrictedByCode: false,
    }
  }

  return {
    mercadoPago: mercadoPagoOpen && promotionCodeAllowsChannel(policy, 'mercado_pago'),
    bankTransfer: promotionCodeAllowsChannel(policy, 'bank_transfer'),
    cashPitbull: promotionCodeAllowsChannel(policy, 'cash_pitbull'),
    wiseTransfer: false,
    restrictedByCode: true,
  }
}
