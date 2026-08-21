import { X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import TransferReceipt from './TransferReceipt.jsx'
import { usePaymentModal } from './usePaymentModal.js'
import '../../styles/components/transfer-pay-modal.css'

/**
 * Recibo de transferencia + comprobante, como modal. Lo usan la afiliación de
 * cuenta y el checkout de inscripción: mismos datos bancarios, copy distinto.
 *
 * El cuerpo vive en `TransferReceipt`, que también se liquida en línea dentro de
 * la ficha de la oferta exclusiva. Acá queda sólo el envoltorio: encabezado con
 * el importe, foco atrapado y cierre.
 */
export default function TransferPayModal({
  athlete,
  amount,
  currency = 'ARS',
  onClose,
  orderId,
  purpose = 'membership',
  channel = 'bank_transfer',
}) {
  const { t, locale } = useI18n()
  const panelRef = usePaymentModal(onClose)
  const isCompetition = purpose === 'competition'
  const isWise = channel === 'wise_transfer'

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
          <div className="account-transfer-receipt__heading">
            <h2 id="transfer-title">
              {isWise
                ? t('account.membership.transferWiseTitle')
                : isCompetition
                  ? t('pages.register.transferTitle')
                  : t('account.membership.transferTitle')}
            </h2>
            <p className="account-transfer-receipt__total">
              <span className="visually-hidden">{t('account.membership.transferAmount')}</span>
              <strong>{money(amount, locale, currency)}</strong>
            </p>
          </div>
          <button
            type="button"
            className="account-payment-modal__close"
            onClick={onClose}
            aria-label={t('account.membership.transferClose')}
          >
            <X size={18} />
          </button>
        </header>
        <TransferReceipt
          athlete={athlete}
          channel={channel}
          orderId={orderId}
          purpose={purpose}
          warningId="transfer-verify"
        />
        <button type="button" className="account-secondary-action" onClick={onClose}>
          {t('account.membership.transferUnderstood')}
        </button>
      </section>
    </div>
  )
}
