import { ArrowRight, Landmark, Mail } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { buildMailtoHref } from '../../lib/contact.js'
import { money } from '../../lib/format.js'
import { formatWisePrice } from '../../services/checkoutPricing.js'
import '../../styles/components/payment-recovery-panel.css'

export default function PaymentRecoveryPanel({
  amount = null,
  concept = '',
  currency = 'ARS',
  onTransfer,
  reference = '',
  transferAvailable = false,
  transferBusy = false,
}) {
  const { locale, t } = useI18n()
  const amountLabel =
    currency === 'USD' ? formatWisePrice(amount, locale) : amount == null ? '' : money(amount, locale)
  const contactSubject = t('paymentRecovery.contactSubject')
  const contactBody = [
    t('paymentRecovery.contactBody'),
    concept ? `${t('paymentRecovery.concept')}: ${concept}` : '',
    amountLabel ? `${t('paymentRecovery.amount')}: ${amountLabel}` : '',
    reference ? `${t('paymentRecovery.reference')}: ${reference}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  const contactHref = buildMailtoHref({ subject: contactSubject, body: contactBody })

  return (
    <aside className="payment-recovery-panel" aria-labelledby="payment-recovery-title">
      <div className="payment-recovery-panel__copy">
        <span className="payment-recovery-panel__eyebrow">{t('paymentRecovery.eyebrow')}</span>
        <h2 id="payment-recovery-title">{t('paymentRecovery.title')}</h2>
        <p>{t('paymentRecovery.description')}</p>
      </div>
      {amountLabel ? (
        <div className="payment-recovery-panel__summary">
          <span>{concept || t('paymentRecovery.purchase')}</span>
          <strong>{amountLabel}</strong>
        </div>
      ) : null}
      <div className="payment-recovery-panel__actions">
        {transferAvailable ? (
          <button
            type="button"
            className="payment-recovery-panel__transfer"
            disabled={transferBusy}
            onClick={onTransfer}
          >
            <Landmark size={16} aria-hidden />
            <span>{t('paymentRecovery.transferAction')}</span>
            <ArrowRight size={15} aria-hidden />
          </button>
        ) : null}
        <a className="payment-recovery-panel__contact" href={contactHref}>
          <Mail size={16} aria-hidden />
          <span>{t('paymentRecovery.contactAction')}</span>
        </a>
      </div>
      <p className="payment-recovery-panel__note">{t('paymentRecovery.note')}</p>
    </aside>
  )
}
