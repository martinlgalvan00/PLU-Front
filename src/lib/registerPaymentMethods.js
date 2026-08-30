import { money } from './format.js'
import { wisePriceLabel as formatWisePriceLabel } from '../services/checkoutPricing.js'

export function buildRegisterPaymentMethods({
  cashEnabled = false,
  comboOffer = null,
  locale = 'es',
  manualPaymentEnabled = false,
  mercadoPagoEnabled = true,
  registrationManualPrice = null,
  registrationPrice = 0,
  registrationWisePrice = null,
  purchaseType = 'combo',
  t,
  transferEnabled = false,
  wiseEnabled = false,
}) {
  const comboSelected = purchaseType === 'combo'
  const wiseAvailable = wiseEnabled && !comboSelected
  const methodPriceLabel = (method) => {
    if (method === 'wise_transfer') {
      return formatWisePriceLabel(registrationPrice, locale, registrationWisePrice)
    }
    const listPrice = comboSelected ? comboOffer?.price : registrationPrice
    const manualPrice = comboSelected ? comboOffer?.manualPrice : registrationManualPrice
    const amount = method === 'mercado_pago' ? listPrice : manualPrice ?? listPrice
    return Number.isFinite(Number(amount)) ? money(Number(amount), locale) : ''
  }

  const transferOffered = transferEnabled || manualPaymentEnabled
  const cashOffered = cashEnabled || manualPaymentEnabled

  return [
    ...(mercadoPagoEnabled
      ? [
          {
            value: 'mercado_pago',
            label: t('formOptions.payment.mercadoPago'),
            priceLabel: methodPriceLabel('mercado_pago'),
          },
        ]
      : []),
    ...(transferOffered
      ? [
          {
            value: 'manual_link',
            label: t('pages.register.paymentTransferLabel'),
            priceLabel: methodPriceLabel('manual_link'),
          },
        ]
      : []),
    ...(cashOffered
      ? [
          {
            value: 'cash_pitbull',
            label: t('pages.register.paymentCashPitbullLabel'),
            priceLabel: methodPriceLabel('cash_pitbull'),
          },
        ]
      : []),
    ...(wiseAvailable
      ? [
          {
            value: 'wise_transfer',
            label: t('pages.register.paymentWiseLabel'),
            priceLabel: methodPriceLabel('wise_transfer'),
          },
        ]
      : []),
  ]
}
