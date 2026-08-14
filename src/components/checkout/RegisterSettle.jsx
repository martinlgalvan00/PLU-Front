import CheckoutDesk, { CheckoutBar } from './CheckoutDesk.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatShortDate, money } from '../../lib/format.js'

/**
 * Adaptador del flow de inscripción: arma ofertas y medios
 * para el escritorio de cobro. No crea la orden.
 */
export default function RegisterSettle({
  comboComingSoon = false,
  comboEnabled = false,
  comboOffer = null,
  comboSavings = 0,
  membershipPrice = 0,
  onPaymentBlur,
  onPaymentChange,
  onPurchaseTypeChange,
  paymentError = '',
  paymentHint = '',
  paymentMethod,
  purchaseType = 'combo',
  registrationPrice = 0,
  showPackage = false,
  showPayment = false,
}) {
  const { locale, t } = useI18n()
  if (!showPackage && !showPayment) return null

  const comboEndsLabel = comboOffer?.endsAt
    ? formatShortDate(String(comboOffer.endsAt).slice(0, 10), locale)
    : null
  const comboSelected = purchaseType === 'combo'
  const offers = []

  if (showPackage && (comboEnabled || comboComingSoon)) {
    offers.push({
      id: 'combo',
      name: t('account.membership.comboTitle'),
      priceLabel: comboOffer ? money(comboOffer.price, locale) : '—',
      featured: true,
      disabled: comboComingSoon,
      savings:
        comboSavings > 0
          ? t('pages.register.packageSavings', { amount: money(comboSavings, locale) })
          : '',
      deadline: comboEndsLabel
        ? t('account.membership.comboUntil', { date: comboEndsLabel })
        : '',
      ledger: [
        {
          label: t('pages.register.membershipPlanLabel'),
          amount: money(membershipPrice, locale),
        },
        {
          label: t('pages.register.checkoutRegistrationLine'),
          amount: money(registrationPrice, locale),
        },
      ],
    })
  }

  if (showPackage) {
    offers.push({
      id: 'registration',
      name: t('account.membership.comboSeparate'),
      priceLabel: money(registrationPrice, locale),
    })
  }

  const methods = showPayment
      ? [
          { value: 'mercado_pago', label: t('formOptions.payment.mercadoPago') },
        { value: 'manual_link', label: t('pages.register.paymentTransferLabel') },
      ]
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
      paymentHint={paymentHint}
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
      ctaLabel={hideCta ? undefined : submitting ? t('common.loading') : t('pages.register.checkoutContinue')}
      hideCta={hideCta}
      packageLabel={packageLabel}
      submitting={submitting}
      total={checkoutTotal}
    />
  )
}
