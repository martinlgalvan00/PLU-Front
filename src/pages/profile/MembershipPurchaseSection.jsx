import { useState } from 'react'
import { Check, CreditCard, Landmark, ShieldCheck, X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

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

export default function MembershipPurchaseSection({ athlete }) {
  const { t } = useI18n()
  const [paymentMethod, setPaymentMethod] = useState('mercado_pago')
  const [transferOpen, setTransferOpen] = useState(false)
  const [checkoutMessage, setCheckoutMessage] = useState('')

  function startMembershipPayment() {
    setCheckoutMessage('')
    if (paymentMethod === 'transferencia') {
      setTransferOpen(true)
      return
    }
    setCheckoutMessage(t('account.membership.checkoutMessage'))
  }

  return (
    <section id="account-membership" className="account-section account-section--red">
      <div className="account-section__heading">
        <div className="account-section__icon"><ShieldCheck size={21} /></div>
        <div><span>{t('account.membership.eyebrow')}</span><h2>{t('account.membership.title')}</h2></div>
        <strong className="account-section__price">$38.000 <small>ARS</small></strong>
      </div>
      <p className="account-section__lead">{t('account.membership.lead')}</p>
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
          <span><strong>Mercado Pago</strong><small>{t('account.membership.onlineCheckout')}</small></span>
        </label>
        <label className={paymentMethod === 'transferencia' ? 'is-selected' : ''}>
          <input type="radio" name="membership-payment" value="transferencia" checked={paymentMethod === 'transferencia'} onChange={(event) => setPaymentMethod(event.target.value)} />
          <Landmark size={21} />
          <span><strong>{t('account.membership.transfer')}</strong><small>{t('account.membership.manualValidation')}</small></span>
        </label>
      </fieldset>
      <button type="button" className="account-primary-action" onClick={startMembershipPayment}>
        {t('account.membership.continueWith', {
          method: paymentMethod === 'mercado_pago' ? 'Mercado Pago' : t('account.membership.transfer'),
        })}
      </button>
      {checkoutMessage && <p className="account-checkout-message" role="status">{checkoutMessage}</p>}

      {transferOpen && <TransferModal athlete={athlete} onClose={() => setTransferOpen(false)} />}
    </section>
  )
}
