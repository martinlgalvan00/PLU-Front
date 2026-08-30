import CheckoutDesk, { CheckoutBar } from './CheckoutDesk.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { resolveComboDeal } from '../../lib/eventPricing.js'
import { money } from '../../lib/format.js'
import { buildRegisterPaymentMethods } from '../../lib/registerPaymentMethods.js'
import {
  previewCheckoutPrice,
  wisePriceLabel as formatWisePriceLabel,
} from '../../services/checkoutPricing.js'

export default function RegisterSettle({
  cashEnabled = false,
  comboComingSoon = false,
  comboEnabled = false,
  comboOffer = null,
  comboSavings = 0,
  mercadoPagoEnabled = true,
  manualPaymentEnabled = false,
  wiseEnabled = false,
  membershipPrice = 0,
  membershipManualPrice = null,
  onPaymentBlur,
  onPaymentChange,
  onPurchaseTypeChange,
  paymentError = '',
  paymentHint = '',
  paymentMethod,
  purchaseType = 'combo',
  registrationPrice = 0,
  registrationManualPrice = null,
  registrationWisePrice = null,
  showPackage = false,
  showPayment = false,
  transferEnabled = false,
}) {
  const { locale, t } = useI18n()
  if (!showPackage && !showPayment) return null

  const comboSelected = purchaseType === 'combo'
  const wiseAvailable = wiseEnabled && !comboSelected
  const wiseSelected = paymentMethod === 'wise_transfer' && wiseAvailable
  const displayedMembershipPrice = previewCheckoutPrice({
    paymentMethod,
    manualPrice: membershipManualPrice,
    fallback: membershipPrice,
  })
  const displayedRegistrationPrice = previewCheckoutPrice({
    paymentMethod,
    manualPrice: registrationManualPrice,
    fallback: registrationPrice,
  })
  const displayedComboPrice = previewCheckoutPrice({
    paymentMethod,
    manualPrice: comboOffer?.manualPrice,
    fallback: comboOffer?.price ?? 0,
  })
  const displayedDeal = resolveComboDeal({
    membership: displayedMembershipPrice,
    registration: displayedRegistrationPrice,
    combo: displayedComboPrice,
  })
  const offers = []

  if (showPackage && (comboEnabled || comboComingSoon)) {
    offers.push({
      id: 'combo',
      name: t('account.membership.comboTitle'),
      priceLabel: !comboOffer
        ? '-'
        : wiseSelected
          ? formatWisePriceLabel(displayedComboPrice, locale)
          : money(displayedComboPrice, locale),
      featured: true,
      disabled: comboComingSoon,
      savings: displayedDeal?.live
        ? displayedDeal.percent > 0
          ? t('comboDeal.percent', { percent: displayedDeal.percent })
          : t('pages.register.packageSavings', { amount: money(comboSavings, locale) })
        : '',
      deal:
        comboOffer && displayedDeal?.live
          ? {
              membershipPrice: displayedMembershipPrice,
              registrationPrice: displayedRegistrationPrice,
              comboPrice: displayedComboPrice,
              endsAt: comboOffer.endsAt,
            }
          : null,
    })
  }

  if (showPackage) {
    offers.push({
      id: 'registration',
      name: t('account.membership.comboSeparate'),
      priceLabel: wiseSelected
        ? formatWisePriceLabel(displayedRegistrationPrice, locale, registrationWisePrice)
        : money(displayedRegistrationPrice, locale),
    })
  }

  const transferOffered = transferEnabled || manualPaymentEnabled
  const cashOffered = cashEnabled || manualPaymentEnabled
  const methods = showPayment
    ? buildRegisterPaymentMethods({
        cashEnabled,
        comboOffer,
        locale,
        manualPaymentEnabled,
        mercadoPagoEnabled,
        registrationManualPrice,
        registrationPrice,
        registrationWisePrice,
        purchaseType,
        t,
        transferEnabled,
        wiseEnabled,
      })
    : []

  return (
    <CheckoutDesk
      methods={methods}
      methodsLabel={t('pages.register.paymentMethod')}
      methodsLegend={t('pages.register.competitionPaymentTitle')}
      offerLegend={showPackage ? t('pages.register.packageLegend') : ''}
      offerLegendBadge={comboComingSoon ? t('account.membership.comboComingSoon') : ''}
      offerName="competition-purchase-type"
      offers={offers}
      paymentError={paymentError}
      paymentHint={
        paymentHint ||
        (methods.length === 0 && showPayment
          ? t('pages.register.paymentNoChannelHint')
          : wiseSelected
            ? t('pages.register.paymentWisePriceHint')
            : mercadoPagoEnabled && !transferOffered && !cashOffered && !wiseAvailable
              ? t('pages.register.paymentMercadoPagoOnlyHint')
              : '')
      }
      paymentMethod={paymentMethod}
      selectedOfferId={comboSelected ? 'combo' : 'registration'}
      onOfferChange={onPurchaseTypeChange}
      onPaymentBlur={onPaymentBlur}
      onPaymentChange={onPaymentChange}
    />
  )
}

export function RegisterCheckoutBar({
  checkoutTotal,
  disabled = false,
  flow,
  hideCta = false,
  packageLabel,
  settle = false,
  submitting = false,
}) {
  const { t } = useI18n()

  return (
    <CheckoutBar
      className={[
        'register-checkout__bar register-card__footer--checkout',
        settle ? 'register-settle-bar' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      ctaClassName={[
        'btn register-card__submit plu-checkout__submit',
        flow === 'competition' ? 'register-card__submit--competition' : '',
        flow === 'membership' ? 'register-card__submit--membership' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      ctaLabel={
        hideCta
          ? undefined
          : submitting
            ? t('common.loading')
            : t('pages.register.checkoutContinue')
      }
      disabled={disabled}
      hideCta={hideCta}
      packageLabel={packageLabel}
      submitting={submitting}
      total={checkoutTotal}
    />
  )
}
