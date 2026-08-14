// Es sólo la previsualización. La API repite esta política y es quien fija el
// importe persistido antes de iniciar Mercado Pago.
const PRE_SALE_END = new Date('2026-08-29T03:00:00.000Z')

export function previewCheckoutPrice({ concept, paymentMethod, fallback, now = new Date() }) {
  if (now >= PRE_SALE_END) return fallback
  const bankTransfer = paymentMethod === 'manual_link' || paymentMethod === 'transferencia'
  const cashAtPitbull = paymentMethod === 'cash_pitbull'
  if (concept === 'combo') return bankTransfer ? 120000 : cashAtPitbull ? 150000 : 170000
  if (concept === 'membership' || concept === 'registration') {
    return bankTransfer || cashAtPitbull ? 75000 : 85000
  }
  return fallback
}
