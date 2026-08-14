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

export function checkoutPriceFor({ concept, paymentMethod, now = new Date() }) {
  if (now >= PITBULL_PRE_SALE_END) return null
  const bankTransfer = paymentMethod === 'manual_link'
  const cashAtPitbull = paymentMethod === 'cash_pitbull'
  if (concept === 'combo') return bankTransfer ? 120000 : cashAtPitbull ? 150000 : 170000
  if (concept === 'membership' || concept === 'registration') {
    return bankTransfer || cashAtPitbull ? 75000 : 85000
  }
  return null
}
