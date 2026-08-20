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
  // Cada canal manual se ofrece por separado: Administración puede abrirlos a
  // todos, o un código de promoción destrabar sólo uno para quien lo use.
  cashEnabled = false,
  comboComingSoon = false,
  comboEnabled = false,
  comboOffer = null,
  comboSavings = 0,
  // Mercado Pago también se abre y cierra por concepto desde Administración:
  // ya no es un medio incondicional. Default abierto para no dejar una pantalla
  // sin ningún medio ante una lectura incompleta.
  mercadoPagoEnabled = true,
  // Compatible histórico: abre los dos canales manuales salvo que se pase cada
  // uno por separado.
  manualPaymentEnabled = false,
  // Wise es una celda más de la matriz, con su propio interruptor —no
  // depende de `manualPaymentEnabled` ni de un cupón.
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
  showPackage = false,
  showPayment = false,
  transferEnabled = false,
}) {
  const { locale, t } = useI18n()
  if (!showPackage && !showPayment) return null

  const comboSelected = purchaseType === 'combo'
  const wiseSelected = paymentMethod === 'wise_transfer'
  const wisePriceLabel = t('pages.register.paymentWisePriceHint')
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
      priceLabel: !comboOffer ? '—' : wiseSelected ? wisePriceLabel : money(displayedComboPrice, locale),
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
      priceLabel: wiseSelected ? wisePriceLabel : money(displayedRegistrationPrice, locale),
    })
  }

  // Canal manual cerrado desde el panel: transferencia y efectivo no se ofrecen,
  // en vez de aparecer y fallar con 409 al enviar. `manualPaymentEnabled` es el
  // compatible histórico: abre los dos salvo que se pase cada canal aparte.
  const transferOffered = transferEnabled || manualPaymentEnabled
  const cashOffered = cashEnabled || manualPaymentEnabled
  const methods = showPayment
    ? [
        ...(mercadoPagoEnabled
          ? [{ value: 'mercado_pago', label: t('formOptions.payment.mercadoPago') }]
          : []),
        ...(transferOffered
          ? [{ value: 'manual_link', label: t('pages.register.paymentTransferLabel') }]
          : []),
        ...(cashOffered
          ? [{ value: 'cash_pitbull', label: t('pages.register.paymentCashPitbullLabel') }]
          : []),
        ...(wiseEnabled ? [{ value: 'wise_transfer', label: t('pages.register.paymentWiseLabel') }] : []),
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
      paymentHint={
        paymentHint ||
        // Sin ningún medio abierto hay que decirlo: un escritorio de cobro
        // vacío no se explica solo.
        (methods.length === 0 && showPayment
          ? t('pages.register.paymentNoChannelHint')
          : mercadoPagoEnabled && !transferOffered && !cashOffered && !wiseEnabled
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
