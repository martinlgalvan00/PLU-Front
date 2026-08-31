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
 * La matriz de canales que viaja en el `benefit` de un canje aceptado
 * (20260912100000), en la forma de politica que esperan los resolvedores de
 * este modulo. Null cuando el canje no la trae —un resolvedor viejo durante un
 * despliegue escalonado, o un canje rechazado—: sin dato no se decide nada.
 */
export function promotionRedemptionChannelPolicy(resolution) {
  if (resolution?.accepted !== true) return null
  const benefit = resolution.benefit
  const declaresChannels =
    Array.isArray(benefit?.manualChannels) || typeof benefit?.mercadoPagoEnabled === 'boolean'
  if (!declaresChannels) return null
  return {
    found: true,
    manualChannels: Array.isArray(benefit.manualChannels) ? benefit.manualChannels : [],
    mercadoPagoEnabled: benefit.mercadoPagoEnabled !== false,
  }
}

const PROMOTION_CHANNEL_PRIORITY = ['mercado_pago', 'bank_transfer', 'cash_pitbull']

/**
 * A que canal saltar cuando el elegido no sobrevive a la politica del codigo
 * recien canjeado (p. ej. un precio pactado solo para Mercado Pago canjeado
 * con transferencia elegida). Null si el actual ya sirve —no hay nada que
 * tocar— o si la politica no deja ninguno abierto: en ese caso el preview o
 * la orden explican el rechazo con su propio motivo. La preferencia es la
 * misma del checkout: pasarela, despues transferencia, despues efectivo.
 */
export function resolvePromotionChannelSwitch(policy, { current, mercadoPagoOpen = true } = {}) {
  if (!promotionCodeHasChannelPolicy(policy)) return null
  const resolved = resolvePromotionPaymentChannels({ policy, mercadoPagoOpen })
  const open = {
    mercado_pago: resolved.mercadoPago,
    bank_transfer: resolved.bankTransfer,
    cash_pitbull: resolved.cashPitbull,
  }
  if (open[current]) return null
  return PROMOTION_CHANNEL_PRIORITY.find((channel) => open[channel]) ?? null
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
