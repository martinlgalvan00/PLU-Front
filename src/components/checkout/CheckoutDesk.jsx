import { useEffect, useId, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import SeasonComboOffer from '../ui/SeasonComboOffer.jsx'
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

  // Una oferta que aparece cuando la lista ya existía entra una vez.
  //
  // El caso que lo justifica es el código que destraba el combo: hasta acá la
  // tarjeta del paquete se sumaba a la lista sin que nada lo dijera, y es el
  // pago de la exclusividad —lo que el atleta canjeó recién—. Distinguirla de
  // las que ya estaban necesita memoria: una animación on-mount por CSS
  // animaría TODAS las ofertas en cada carga del checkout, que es decorar la
  // pasarela.
  //
  // La lista vacía no cuenta como estado conocido: los checkouts la llenan
  // después de resolver disponibilidad, y tomar ese `[]` como base habría hecho
  // que en cada visita entraran todas.
  const offerIds = offers.map((offer) => offer.id).join('|')
  const knownOffersRef = useRef(null)
  const [unlockedOffers, setUnlockedOffers] = useState(() => new Set())

  useEffect(() => {
    const ids = offerIds ? offerIds.split('|') : []
    if (ids.length === 0) return
    if (knownOffersRef.current === null) {
      knownOffersRef.current = new Set(ids)
      return
    }
    const fresh = ids.filter((id) => !knownOffersRef.current.has(id))
    if (fresh.length === 0) return
    for (const id of fresh) knownOffersRef.current.add(id)
    // La marca no se saca nunca. Quitarla en el render siguiente —que puede
    // llegar 16ms después, cuando el atleta elige la oferta— cortaría la
    // animación a mitad de camino.
    setUnlockedOffers((prev) => new Set([...prev, ...fresh]))
  }, [offerIds])

  if (offers.length === 0 && methods.length === 0 && !bar) return null

  const selectable = offers.length > 1
  const paymentErrorId = paymentError ? errorId : undefined
  const offerItems = offers.map((offer) => {
    const selected = offer.id === selectedOfferId
    const showDeal = selected && offer.featured && offer.deal
    const showLedger = selected && offer.featured && !showDeal && offer.ledger?.length > 0
    const OfferTag = selectable ? 'label' : 'div'
    const offerClass = [
      'plu-checkout__offer',
      offer.featured ? 'is-featured' : '',
      selected ? 'is-selected' : '',
      offer.disabled ? 'is-disabled' : '',
      showDeal ? 'has-deal' : '',
      unlockedOffers.has(offer.id) ? 'is-unlocked' : '',
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
          {showDeal ? null : offer.savings ? (
            <span className="plu-checkout__offer-save">{offer.savings}</span>
          ) : null}
        </span>
        {showDeal ? null : (
          <span className="plu-checkout__offer-price-block">
            <strong className="plu-checkout__offer-price">{offer.priceLabel}</strong>
            {offer.comparePriceLabel ? (
              <s className="plu-checkout__offer-compare">{offer.comparePriceLabel}</s>
            ) : null}
          </span>
        )}
        {showDeal ? (
          <SeasonComboOffer
            variant="compact"
            membershipPrice={offer.deal.membershipPrice}
            registrationPrice={offer.deal.registrationPrice}
            comboPrice={offer.deal.comboPrice}
            endsAt={offer.deal.endsAt}
          />
        ) : null}
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
          <div
            className="plu-checkout__pills"
            role="radiogroup"
            aria-label={methodsLabel || methodsLegend}
          >
            {methods.map((method) => (
              <label
                key={method.value}
                className={[
                  'plu-checkout__pill',
                  'plu-checkout__pill--selectable',
                  method.detail ? 'has-detail' : '',
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
                <span className="plu-checkout__pill-copy">
                  <span className="plu-checkout__pill-label">{method.label}</span>
                  {method.detail ? (
                    <span className="plu-checkout__pill-detail">{method.detail}</span>
                  ) : null}
                </span>
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
  compareTotal = null,
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
  const totalLabelText =
    total == null ? '—' : typeof total === 'string' ? total : money(total, locale)
  const compareLabelText =
    compareTotal == null
      ? null
      : typeof compareTotal === 'string'
        ? compareTotal
        : money(compareTotal, locale)

  return (
    <div className={['plu-checkout__bar', className].filter(Boolean).join(' ')}>
      <div className="plu-checkout__summary" aria-live="polite">
        {packageLabel ? (
          <p className="plu-checkout__package register-checkout__package">{packageLabel}</p>
        ) : null}
        <div className="plu-checkout__total">
          <span>{totalLabel || t('pages.register.total')}</span>
          {/* `key` por importe: es lo que hace que el precio se vuelva a
              escribir en vez de reemplazarse en un frame. React desmonta y
              vuelve a montar el nodo cuando el número cambia —código aplicado,
              código quitado, recotización por medio de pago— y la animación
              one-shot de `checkout-desk.css` arranca de nuevo. Sin el `key` la
              animación sólo correría en el primer render, que es justo el
              momento en que no hay nada que contar. */}
          <span className="plu-checkout__total-amounts">
            {compareLabelText ? (
              <s className="plu-checkout__total-compare" key={compareLabelText}>
                {compareLabelText}
              </s>
            ) : null}
            <strong key={totalLabelText}>{totalLabelText}</strong>
          </span>
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
            <span className="plu-spinner" aria-hidden />
          ) : (
            <ArrowRight size={16} className="plu-checkout__submit-arrow" aria-hidden />
          )}
        </button>
      )}
    </div>
  )
}
