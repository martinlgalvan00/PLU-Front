import { HttpError } from '../../lib/errors.js'
import { arsToWiseUsd, configuredNumber } from '../../../shared/wisePricing.js'

export function storagePaymentMethod(paymentMethod) {
  return paymentMethod === 'cash_pitbull' || paymentMethod === 'wise_transfer'
    ? 'manual_link'
    : paymentMethod
}

export function manualPaymentChannel(paymentMethod) {
  if (paymentMethod === 'cash_pitbull') return 'cash_pitbull'
  if (paymentMethod === 'wise_transfer') return 'wise_transfer'
  if (paymentMethod === 'manual_link') return 'bank_transfer'
  return null
}

export function isManualPaymentMethod(paymentMethod) {
  return manualPaymentChannel(paymentMethod) !== null
}

export function paymentChannelOf(paymentMethod) {
  return manualPaymentChannel(paymentMethod) ?? 'mercado_pago'
}

/**
 * Precio en USD para pagos por Wise. Si existe WISE_PRICE_*_USD se respeta
 * como override operativo; si no, se deriva del precio ARS vigente usando el
 * dolar blue configurado y se redondea hacia arriba en saltos de USD 5.
 */
export function wisePriceFor({ concept, arsAmount, configuredUsd = null }, env = process.env) {
  const key = {
    membership: 'WISE_PRICE_MEMBERSHIP_USD',
    registration: 'WISE_PRICE_REGISTRATION_USD',
    combo: 'WISE_PRICE_COMBO_USD',
    ticket: 'WISE_PRICE_TICKET_USD',
  }[concept]
  if (!key) return null

  const amount = configuredNumber(configuredUsd) ?? configuredNumber(env[key]) ?? arsToWiseUsd(arsAmount, env)
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new HttpError(
      503,
      `Falta configurar ${key} o un precio ARS valido para aceptar pagos por Wise.`,
    )
  }
  return { amount, currency: 'USD' }
}
