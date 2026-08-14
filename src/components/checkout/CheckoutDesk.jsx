import { useId } from 'react'
import { ArrowRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import '../../styles/components/checkout-desk.css'

/**
 * Mesa visual de cobro: oferta, medio y total.
 * No crea la orden ni confirma el pago; eso sigue en el servicio/API.
 */
export default function CheckoutDesk({
  bar = null,
  methods = [],
  methodsDisabled = false,
  methodsLabel = '',
  methodsLegend = '',
  offerLegend = '',
  offerLegendBadge = '',
  offerName = 'checkout-offer',
  offers = [],
  onOfferChange,
  onPaymentBlur,
  onPaymentChange,
  paymentError = '',
  paymentHint = '',
  paymentMethod,
  paymentName = 'paymentMethod',
  selectedOfferId,
}) {
  const errorId = useId()
  if (offers.length === 0 && methods.length === 0 && !bar) return null

  const selectable = offers.length > 1
  const paymentErrorId = paymentError ? errorId : undefined
  const offerItems = offers.map((offer) => {
    const selected = offer.id === selectedOfferId
    const showLedger = selected && offer.featured && offer.ledger?.length > 0
    const OfferTag = selectable ? 'label' : 'div'
    const offerClass = [
      'plu-checkout__offer',
      offer.featured ? 'is-featured' : '',
      selected ? 'is-selected' : '',
      offer.disabled ? 'is-disabled' : '',
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <OfferTag key={offer.id} className={offerClass}>
        {selectable ? (
          <input
            checked={selected}
            className="plu-checkout__offer-control"
            disabled={offer.disabled}
            name={offerName}
            type="radio"
            value={offer.id}
            onChange={() => onOfferChange?.(offer.id)}
          />
        ) : null}
        <span className="plu-checkout__offer-copy">
          <span className="plu-checkout__offer-name">{offer.name}</span>
          {offer.savings ? <span className="plu-checkout__offer-save">{offer.savings}</span> : null}
          {offer.deadline ? <span className="plu-checkout__deadline">{offer.deadline}</span> : null}
        </span>
        <strong className="plu-checkout__offer-price">{offer.priceLabel}</strong>
        {showLedger ? (
          <ul className="plu-checkout__ledger" aria-hidden>
            {offer.ledger.map((line) => (
              <li key={line.label}>
                <span>{line.label}</span>
                <span>{line.amount}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </OfferTag>
    )
  })

  return (
    <div className="plu-checkout">
      {offers.length > 0 ? (
        selectable ? (
          <fieldset
            className={`plu-checkout__offers${offers.some((offer) => offer.disabled) ? ' is-coming-soon' : ''}`}
          >
            {offerLegend ? (
              <legend>
                <span>{offerLegend}</span>
                {offerLegendBadge ? <strong>{offerLegendBadge}</strong> : null}
              </legend>
            ) : null}
            <div className="plu-checkout__offer-list">{offerItems}</div>
          </fieldset>
        ) : (
          <div className="plu-checkout__offers">
            <div className="plu-checkout__offer-list">{offerItems}</div>
          </div>
        )
      ) : null}

      {methods.length > 0 ? (
        <fieldset
          className={`plu-checkout__methods${paymentError ? ' is-invalid' : ''}`}
          aria-describedby={paymentErrorId}
          aria-invalid={Boolean(paymentError)}
          disabled={methodsDisabled || undefined}
        >
          {methodsLegend ? <legend>{methodsLegend}</legend> : null}
          {paymentHint ? <p className="plu-checkout__hint">{paymentHint}</p> : null}
          <div className="plu-checkout__pills" role="radiogroup" aria-label={methodsLabel || methodsLegend}>
            {methods.map((method) => (
              <label
                key={method.value}
                className={[
                  'plu-checkout__pill',
                  paymentMethod === method.value ? 'is-selected' : '',
                  method.disabled ? 'is-disabled' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <input
                  checked={paymentMethod === method.value}
                  disabled={method.disabled}
                  name={paymentName}
                  type="radio"
                  value={method.value}
                  onBlur={onPaymentBlur}
                  onChange={onPaymentChange}
                />
                <span className="plu-checkout__pill-label">{method.label}</span>
              </label>
            ))}
          </div>
          {paymentError ? (
            <span className="field__error" id={paymentErrorId} role="alert">
              {paymentError}
            </span>
          ) : null}
        </fieldset>
      ) : null}

      {bar}
    </div>
  )
}

export function CheckoutBar({
  className = '',
  ctaClassName = '',
  ctaLabel,
  disabled = false,
  hideCta = false,
  onClick,
  packageLabel = '',
  submitting = false,
  total,
  totalLabel,
  type = 'submit',
}) {
  const { locale, t } = useI18n()

  return (
    <div className={['plu-checkout__bar', className].filter(Boolean).join(' ')}>
      <div className="plu-checkout__summary" aria-live="polite">
        {packageLabel ? (
          <p className="plu-checkout__package register-checkout__package">{packageLabel}</p>
        ) : null}
        <div className="plu-checkout__total">
          <span>{totalLabel || t('pages.register.total')}</span>
          <strong>{total == null ? '—' : money(total, locale)}</strong>
        </div>
      </div>
      {hideCta ? null : (
        <button
          type={type}
          className={ctaClassName || 'btn plu-checkout__submit'}
          disabled={disabled || submitting}
          aria-busy={submitting || undefined}
          onClick={onClick}
        >
          {ctaLabel}
          {submitting ? (
            <span className="plu-checkout__submit-spinner" aria-hidden />
          ) : (
            <ArrowRight size={16} className="plu-checkout__submit-arrow" aria-hidden />
          )}
        </button>
      )}
    </div>
  )
}
