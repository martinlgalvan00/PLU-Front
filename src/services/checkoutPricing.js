import { arsToWiseUsd } from '../../shared/wisePricing.js'
import { env } from '../config/env.js'

/**
 * La UI llama `transferencia` a lo que la API llama `manual_link`. Todo lo que
 * viaje al backend tiene que ir traducido: el preview de un cupon calculado
 * sobre el canal equivocado le muestra al atleta un ahorro que despues no se
 * cumple.
 */
export function toApiPaymentMethod(paymentMethod) {
  if (paymentMethod === 'transferencia') return 'manual_link'
  if (
    paymentMethod === 'mercado_pago' ||
    paymentMethod === 'cash_pitbull' ||
    paymentMethod === 'wise_transfer'
  ) {
    return paymentMethod
  }
  if (paymentMethod === 'manual_link') return 'manual_link'
  return null
}

/**
 * El mismo medio, nombrado como canal de la matriz de promociones
 * (`discount_codes.manual_channels`): la transferencia —`transferencia` en la
 * UI de afiliacion, `manual_link` en la de inscripcion— es `bank_transfer`.
 */
export function paymentMethodToPromotionChannel(paymentMethod) {
  if (paymentMethod === 'transferencia' || paymentMethod === 'manual_link') return 'bank_transfer'
  if (
    paymentMethod === 'mercado_pago' ||
    paymentMethod === 'cash_pitbull' ||
    paymentMethod === 'wise_transfer'
  ) {
    return paymentMethod
  }
  return null
}

/**
 * Solo previsualizacion: la API vuelve a resolver el precio contra el plan,
 * evento o combo antes de crear la orden.
 */
export function previewCheckoutPrice({ paymentMethod, manualPrice, fallback }) {
  const isManualChannel =
    paymentMethod === 'manual_link' ||
    paymentMethod === 'transferencia' ||
    paymentMethod === 'cash_pitbull'
  if (isManualChannel && manualPrice != null) return manualPrice
  return fallback
}

export function previewWisePrice(amountArs) {
  return arsToWiseUsd(amountArs, {
    VITE_WISE_BLUE_RATE_ARS: env.payments.wiseBlueRateArs,
    VITE_WISE_ROUNDING_STEP_USD: env.payments.wiseRoundingStepUsd,
  })
}

export function wisePriceLabel(amountArs, locale = 'es', configuredUsd = null) {
  const amount = Number(configuredUsd) > 0 ? Number(configuredUsd) : previewWisePrice(amountArs)
  if (!amount) return 'USD -'
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-AR', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatWisePrice(amountUsd, locale = 'es') {
  const amount = Number(amountUsd)
  if (!Number.isFinite(amount) || amount <= 0) return 'USD -'
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-AR', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}
