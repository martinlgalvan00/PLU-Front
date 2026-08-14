import CheckoutDesk, { CheckoutBar } from './CheckoutDesk.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { resolveComboDeal } from '../../lib/eventPricing.js'
import { money } from '../../lib/format.js'
import { previewCheckoutPrice } from '../../services/checkoutPricing.js'

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

  const comboSelected = purchaseType === 'combo'
  const displayedMembershipPrice = previewCheckoutPrice({ concept: 'membership', paymentMethod, fallback: membershipPrice })
  const displayedRegistrationPrice = previewCheckoutPrice({ concept: 'registration', paymentMethod, fallback: registrationPrice })
  const displayedComboPrice = previewCheckoutPrice({ concept: 'combo', paymentMethod, fallback: comboOffer?.price ?? 0 })
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
      priceLabel: comboOffer ? money(displayedComboPrice, locale) : '—',
      featured: true,
      disabled: comboComingSoon,
      // El ahorro se anuncia con los precios que se muestran para el medio
      // elegido. Con los de lista, un combo sin descuento real seguía diciendo
      // "ahorrás".
      savings: displayedDeal?.live
        ? displayedDeal.percent > 0
          ? t('comboDeal.percent', { percent: displayedDeal.percent })
          : t('pages.register.packageSavings', { amount: money(comboSavings, locale) })
        : '',
      // Mismo criterio para el bloque de promo: `SeasonComboOffer` se apaga
      // solo si no hay ahorro, y la fila quedaba sin ningún precio visible.
      deal: comboOffer && displayedDeal?.live
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
      priceLabel: money(displayedRegistrationPrice, locale),
    })
  }

  const methods = showPayment
      ? [
          { value: 'mercado_pago', label: t('formOptions.payment.mercadoPago') },
          { value: 'manual_link', label: t('pages.register.paymentTransferLabel') },
          { value: 'cash_pitbull', label: t('pages.register.paymentCashPitbullLabel') },
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
