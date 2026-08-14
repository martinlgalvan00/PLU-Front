import { X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { env } from '../../config/env.js'
import TransferProofUpload from '../ui/TransferProofUpload.jsx'
import { usePaymentModal } from './usePaymentModal.js'
import '../../styles/components/transfer-pay-modal.css'

/**
 * Recibo de transferencia + comprobante. Lo usan la afiliación de cuenta y
 * el checkout de inscripción: mismos datos bancarios, copy distinto.
 */
export default function TransferPayModal({
  athlete,
  amount,
  onClose,
  orderId,
  purpose = 'membership',
}) {
  const { t, locale } = useI18n()
  const panelRef = usePaymentModal(onClose)
  const isCompetition = purpose === 'competition'
  const askAdmin = t('account.membership.transferAskAdmin')

  return (
    <div className="account-payment-modal__overlay" role="presentation" onMouseDown={onClose}>
      <section
        ref={panelRef}
        aria-labelledby="transfer-title"
        aria-describedby="transfer-verify"
        aria-modal="true"
        className="account-payment-modal account-payment-modal--transfer"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="account-payment-modal__header">
          <h2 id="transfer-title">
            {isCompetition
              ? t('pages.register.transferTitle')
              : t('account.membership.transferTitle')}
          </h2>
          <button
            type="button"
            className="account-payment-modal__close"
            onClick={onClose}
            aria-label={t('account.membership.transferClose')}
          >
            <X size={18} />
          </button>
        </header>
        <div className="account-transfer-receipt">
          <p className="account-transfer-receipt__total">
            <span>{t('account.membership.transferAmount')}</span>
            <strong>{money(amount, locale)}</strong>
          </p>
          <dl className="account-transfer-data account-transfer-data--receipt">
            <div>
              <dt>{t('account.membership.transferAlias')}</dt>
              <dd>{env.payments.transferAlias || askAdmin}</dd>
            </div>
            <div>
              <dt>{t('account.membership.transferAccount')}</dt>
              <dd>{t('account.membership.transferAccountValue')}</dd>
            </div>
            {env.payments.transferCbu ? (
              <div>
                <dt>{t('account.membership.transferCbu')}</dt>
                <dd>{env.payments.transferCbu}</dd>
              </div>
            ) : null}
            <div>
              <dt>{t('account.membership.transferHolder')}</dt>
              <dd>{env.payments.transferHolder || askAdmin}</dd>
            </div>
            <div>
              <dt>{t('account.membership.transferReference')}</dt>
              <dd>
                {athlete.documentId} · {athlete.fullName}
              </dd>
            </div>
          </dl>
          <p id="transfer-verify" className="account-transfer-warning" role="note">
            {t('account.membership.transferVerifyWarning')}
          </p>
        </div>
        <p className="account-payment-modal__footnote">
          {isCompetition
            ? t('pages.register.transferHint')
            : t('account.membership.transferHint')}
        </p>
        {orderId ? <TransferProofUpload orderId={orderId} /> : null}
        <button type="button" className="account-secondary-action" onClick={onClose}>
          {t('account.membership.transferUnderstood')}
        </button>
      </section>
    </div>
  )
}
