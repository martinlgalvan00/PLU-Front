import { useEffect, useMemo, useState } from 'react'
import { Check, CreditCard, Landmark, ShieldCheck, X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { PRICING } from '../../lib/constants.js'
import { formatShortDate, money } from '../../lib/format.js'
import { env } from '../../config/env.js'
import { listMembershipPlans } from '../../services/paymentService.js'
import MercadoPagoEmbeddedCheckout from '../../components/ui/MercadoPagoEmbeddedCheckout.jsx'

function TransferModal({ athlete, amount, onClose }) {
  const { t, locale } = useI18n()
  return (
    <div className="account-payment-modal__overlay" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="transfer-title"
        aria-modal="true"
        className="account-payment-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header>
          <div>
            <span>{t('account.membership.transferEyebrow')}</span>
            <h2 id="transfer-title">{t('account.membership.transferTitle')}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t('account.membership.transferClose')}><X size={19} /></button>
        </header>
        <div className="account-payment-modal__notice">{t('account.membership.transferNotice')}</div>
        <dl className="account-transfer-data">
          <div><dt>{t('account.membership.transferAlias')}</dt><dd>{env.payments.transferAlias || t('account.membership.transferAskAdmin')}</dd></div>
          <div><dt>{t('account.membership.transferCbu')}</dt><dd>{env.payments.transferCbu || t('account.membership.transferAskAdmin')}</dd></div>
          <div><dt>{t('account.membership.transferHolder')}</dt><dd>{env.payments.transferHolder || t('account.membership.transferAskAdmin')}</dd></div>
          <div><dt>{t('account.membership.transferAmount')}</dt><dd>{money(amount, locale)}</dd></div>
          <div><dt>{t('account.membership.transferReference')}</dt><dd>{athlete.documentId} · {athlete.fullName}</dd></div>
        </dl>
        <p>{t('account.membership.transferHint')}</p>
        <button type="button" className="account-primary-action" onClick={onClose}>{t('account.membership.transferUnderstood')}</button>
      </section>
    </div>
  )
}

export default function MembershipPurchaseSection({
  athlete,
  membership,
  onActivateMembership,
  onCancelMembership,
  onStartMembershipPayment,
  demoMode = false,
}) {
  const { locale, t } = useI18n()
  const [paymentMethod, setPaymentMethod] = useState('mercado_pago')
  const [transferOpen, setTransferOpen] = useState(false)
  const [checkoutMessage, setCheckoutMessage] = useState('')
  const [embeddedOrder, setEmbeddedOrder] = useState(null)
  const [plans, setPlans] = useState([])
  const [planCode, setPlanCode] = useState('plu-annual')
  const membershipActive = membership?.status === 'activa'
  const comboSavings = PRICING.membership + PRICING.event - PRICING.combo
  const methodLabel = paymentMethod === 'mercado_pago'
    ? 'Mercado Pago'
    : t('account.membership.transfer')
  const fallbackPlan = useMemo(() => ({
    code: 'plu-annual',
    name: t('account.membership.membershipPlanLabel'),
    price: PRICING.membership,
    currency: 'ARS',
    billingFrequency: 'annual',
    collectionMode: 'one_time',
  }), [t])
  const availablePlans = plans.length ? plans : [fallbackPlan]
  const selectedPlan = availablePlans.find((plan) => plan.code === planCode) ?? availablePlans[0]

  useEffect(() => {
    let active = true
    listMembershipPlans()
      .then(({ plans: nextPlans }) => {
        if (!active || !nextPlans?.length) return
        setPlans(nextPlans)
        setPlanCode((current) => nextPlans.some((plan) => plan.code === current) ? current : nextPlans[0].code)
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (selectedPlan?.collectionMode === 'recurring' && paymentMethod !== 'mercado_pago') {
      setPaymentMethod('mercado_pago')
    }
  }, [paymentMethod, selectedPlan?.collectionMode])

  async function startMembershipPayment() {
    setCheckoutMessage('')
    setEmbeddedOrder(null)
    const result = await onStartMembershipPayment?.(paymentMethod, selectedPlan.code)
    if (result?.error) {
      setCheckoutMessage(result.error)
      return
    }
    if (paymentMethod === 'transferencia') {
      setTransferOpen(true)
      return
    }
    if (result?.createdOrder) {
      setEmbeddedOrder(result.createdOrder)
      return
    }
    setCheckoutMessage(t('account.membership.checkoutUnavailable'))
  }

  function simulateMembershipPayment() {
    const result = onActivateMembership?.(athlete.id)
    if (result?.error) {
      setCheckoutMessage(result.error)
      return
    }
    setCheckoutMessage(t('account.membership.paymentSimulated'))
  }

  function cancelMembership() {
    onCancelMembership?.(athlete.id)
    setCheckoutMessage(t('account.membership.cancelledMessage'))
  }

  return (
    <section id="account-membership" className="account-section account-section--gold account-membership">
      <header className="account-membership__header">
        <div className="account-membership__intro">
          <div className="account-section__heading">
            <div className="account-section__icon account-section__icon--gold"><ShieldCheck size={21} /></div>
            <div>
              <span>{t('account.membership.eyebrow')}</span>
              <h2>{membershipActive ? t('account.membership.titleActive') : t('account.membership.title')}</h2>
            </div>
          </div>
          <p className="account-section__lead">
            {membershipActive ? t('account.membership.leadActive') : t('account.membership.lead')}
          </p>
        </div>

        {!membershipActive && (
          <div className="account-membership__price">
            <span className="account-membership__price-label">{t('account.membership.priceLabel')}</span>
            <p className="account-membership__price-value">
              {money(selectedPlan.price, locale)}
            </p>
          </div>
        )}
      </header>

      <div className={`account-membership-status account-membership-status--${membershipActive ? 'active' : 'pending'}`}>
        <div className="account-membership-status__copy">
          <span className="account-membership-status__label">
            {membershipActive ? t('account.membership.statusActive') : t('account.membership.statusPending')}
          </span>
          <span className="account-membership-status__value">
            {membershipActive
              ? membership.memberCode
              : t('account.membership.statusNoPayment')}
          </span>
        </div>
        {membershipActive && membership.expirationDate && (
          <span className="account-membership-status__meta">
            {t('account.membership.validUntil', { date: formatShortDate(membership.expirationDate, locale) })}
          </span>
        )}
      </div>

      {!membershipActive && (
        <div className="account-membership__grid">
          <div className="account-membership__plan">
            <h3 className="account-membership__plan-title">{t('account.membership.includes')}</h3>
            <ul className="account-benefits">
              <li><Check size={15} aria-hidden /> {t('account.membership.benefitCredential')}</li>
              <li><Check size={15} aria-hidden /> {t('account.membership.benefitCode')}</li>
              <li><Check size={15} aria-hidden /> {t('account.membership.benefitEvents')}</li>
            </ul>

            <aside className="account-combo-offer">
              <div className="account-combo-offer__copy">
                <span>{t('account.membership.comboEyebrow')}</span>
                <h3>{t('account.membership.comboTitle')}</h3>
                <p>{t('account.membership.comboLead')}</p>
              </div>
              <dl className="account-combo-offer__prices">
                <div>
                  <dt>{t('account.membership.comboSeparate')}</dt>
                  <dd>{money(PRICING.membership + PRICING.event, locale)}</dd>
                </div>
                <div>
                  <dt>{t('account.membership.comboOffer')}</dt>
                  <dd>{money(PRICING.combo, locale)}</dd>
                </div>
                <div>
                  <dt>{t('account.membership.comboSavings')}</dt>
                  <dd>{money(comboSavings, locale)}</dd>
                </div>
              </dl>
            </aside>
          </div>

          <div className="account-membership__checkout">
            {availablePlans.length > 1 && (
              <label className="field">
                <span>{t('account.membership.planSelector')}</span>
                <select value={selectedPlan.code} onChange={(event) => setPlanCode(event.target.value)}>
                  {availablePlans.map((plan) => (
                    <option key={plan.code} value={plan.code}>
                      {plan.name} · {money(plan.price, locale)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <fieldset className="account-payment-options">
              <legend>{t('account.membership.paymentLegend')}</legend>
              <label className={paymentMethod === 'mercado_pago' ? 'is-selected' : ''}>
                <input
                  type="radio"
                  name="membership-payment"
                  value="mercado_pago"
                  checked={paymentMethod === 'mercado_pago'}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                />
                <CreditCard size={20} aria-hidden />
                <span>
                  <span className="account-payment-options__label">Mercado Pago</span>
                  <small>{t('account.membership.onlineCheckout')}</small>
                </span>
              </label>
              <label className={paymentMethod === 'transferencia' ? 'is-selected' : ''}>
                <input
                  type="radio"
                  name="membership-payment"
                  value="transferencia"
                  checked={paymentMethod === 'transferencia'}
                  disabled={selectedPlan.collectionMode === 'recurring'}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                />
                <Landmark size={20} aria-hidden />
                <span>
                  <span className="account-payment-options__label">{t('account.membership.transfer')}</span>
                  <small>{t('account.membership.manualValidation')}</small>
                </span>
              </label>
            </fieldset>

            <div className="account-membership__actions">
              <button type="button" className="account-primary-action account-primary-action--block" onClick={startMembershipPayment}>
                {t('account.membership.continueWith', { method: methodLabel })}
              </button>
            </div>
            {embeddedOrder && <MercadoPagoEmbeddedCheckout order={embeddedOrder} />}
          </div>
        </div>
      )}

      {demoMode && <div className="account-membership__demo">
        <p className="account-membership__demo-label">{t('account.membership.demoLabel')}</p>
        <div className="account-demo-actions">
          {!membershipActive && (
            <button
              type="button"
              className="account-secondary-action account-secondary-action--success"
              onClick={simulateMembershipPayment}
            >
              {t('account.membership.simulatePayment')}
            </button>
          )}
          {membershipActive && (
            <button
              type="button"
              className="account-secondary-action account-secondary-action--danger"
              onClick={cancelMembership}
            >
              {t('account.membership.cancelMembership')}
            </button>
          )}
        </div>
      </div>}

      {checkoutMessage && <p className="account-checkout-message" role="status">{checkoutMessage}</p>}

      {transferOpen && (
        <TransferModal athlete={athlete} amount={selectedPlan.price} onClose={() => setTransferOpen(false)} />
      )}
    </section>
  )
}
