import { useState } from 'react'
import { Check, CreditCard, Landmark, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { PRICING } from '../../lib/constants.js'
import { money } from '../../lib/format.js'

function TransferModal({ athlete, onClose }) {
  const { t } = useI18n()
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
          <div><dt>{t('account.membership.transferAlias')}</dt><dd>PLUARG.MAXIMAL</dd></div>
          <div><dt>{t('account.membership.transferCbu')}</dt><dd>0000003100000000000001</dd></div>
          <div><dt>{t('account.membership.transferHolder')}</dt><dd>Maximal · PLU Argentina</dd></div>
          <div><dt>{t('account.membership.transferAmount')}</dt><dd>$38.000 ARS</dd></div>
          <div><dt>{t('account.membership.transferReference')}</dt><dd>{athlete.documentId} · {athlete.fullName}</dd></div>
        </dl>
        <p>{t('account.membership.transferHint')}</p>
        <button type="button" className="account-primary-action" onClick={onClose}>{t('account.membership.transferUnderstood')}</button>
      </section>
    </div>
  )
}

export default function MembershipPurchaseSection({ athlete, membership, onActivateMembership, onCancelMembership }) {
  const { locale, t } = useI18n()
  const [paymentMethod, setPaymentMethod] = useState('mercado_pago')
  const [transferOpen, setTransferOpen] = useState(false)
  const [checkoutMessage, setCheckoutMessage] = useState('')
  const membershipActive = membership?.status === 'activa'
  const comboSavings = PRICING.membership + PRICING.event - PRICING.combo

  function startMembershipPayment() {
    setCheckoutMessage('')
    if (paymentMethod === 'transferencia') {
      setTransferOpen(true)
      return
    }
    setCheckoutMessage(t('account.membership.checkoutMessage'))
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
    <section id="account-membership" className="account-section account-section--red">
      <div className="account-section__heading">
        <div className="account-section__icon"><ShieldCheck size={21} /></div>
        <div><span>{t('account.membership.eyebrow')}</span><h2>{t('account.membership.title')}</h2></div>
        <span className="account-section__price">$38.000 <small>ARS</small></span>
      </div>
      <p className="account-section__lead">{t('account.membership.lead')}</p>
      <div className={`account-membership-status account-membership-status--${membershipActive ? 'active' : 'pending'}`}>
        <span>{membershipActive ? t('account.membership.statusActive') : t('account.membership.statusPending')}</span>
        <span className="account-membership-status__value">{membershipActive ? membership.memberCode : t('account.membership.statusNoPayment')}</span>
      </div>
      <aside className="account-combo-offer">
        <div className="account-combo-offer__icon" aria-hidden>
          <Sparkles size={20} />
        </div>
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
      <div className="account-benefits">
        <span><Check size={15} /> {t('account.membership.benefitCredential')}</span>
        <span><Check size={15} /> {t('account.membership.benefitCode')}</span>
        <span><Check size={15} /> {t('account.membership.benefitEvents')}</span>
      </div>
      <fieldset className="account-payment-options">
        <legend>{t('account.membership.paymentLegend')}</legend>
        <label className={paymentMethod === 'mercado_pago' ? 'is-selected' : ''}>
          <input type="radio" name="membership-payment" value="mercado_pago" checked={paymentMethod === 'mercado_pago'} onChange={(event) => setPaymentMethod(event.target.value)} />
          <CreditCard size={21} />
          <span><span className="account-payment-options__label">Mercado Pago</span><small>{t('account.membership.onlineCheckout')}</small></span>
        </label>
        <label className={paymentMethod === 'transferencia' ? 'is-selected' : ''}>
          <input type="radio" name="membership-payment" value="transferencia" checked={paymentMethod === 'transferencia'} onChange={(event) => setPaymentMethod(event.target.value)} />
          <Landmark size={21} />
          <span><span className="account-payment-options__label">{t('account.membership.transfer')}</span><small>{t('account.membership.manualValidation')}</small></span>
        </label>
      </fieldset>
      <button type="button" className="account-primary-action" onClick={startMembershipPayment}>
        {t('account.membership.continueWith', {
          method: paymentMethod === 'mercado_pago' ? 'Mercado Pago' : t('account.membership.transfer'),
        })}
      </button>
      <div className="account-demo-actions">
        <button type="button" className="account-primary-action account-primary-action--success" onClick={simulateMembershipPayment}>
          {t('account.membership.simulatePayment')}
        </button>
        <button type="button" className="account-primary-action account-primary-action--danger" onClick={cancelMembership}>
          {t('account.membership.cancelMembership')}
        </button>
      </div>
      {checkoutMessage && <p className="account-checkout-message" role="status">{checkoutMessage}</p>}

      {transferOpen && <TransferModal athlete={athlete} onClose={() => setTransferOpen(false)} />}
    </section>
  )
}
