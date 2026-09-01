import { createPortal } from 'react-dom'
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
 *
 * Se porta a `document.body` para escapar el `transform` de RouteTransition
 * (#main-content): sin portal el `position: fixed` quedaba atrapado y el
 * footer institucional pintaba encima al scrollear.
 */
export default function TransferPayModal({
  amount,
  currency = 'ARS',
  onClose,
  orderId,
  purpose = 'membership',
  channel = 'bank_transfer',
  financingAllowed = false,
  manualPaymentDeclaredAt = null,
  financedEntitlementsAt = null,
  accountDetails = null,
}) {
  const { t, locale } = useI18n()
  const panelRef = usePaymentModal(onClose)
  const isCompetition = purpose === 'competition'
  const isWise = channel === 'wise_transfer'

  return createPortal(
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
        <div className="account-payment-modal__body">
          <TransferReceipt
            channel={channel}
            orderId={orderId}
            purpose={purpose}
            warningId="transfer-verify"
            financingAllowed={financingAllowed}
            manualPaymentDeclaredAt={manualPaymentDeclaredAt}
            financedEntitlementsAt={financedEntitlementsAt}
            accountDetails={accountDetails}
          />
        </div>
        <div className="account-payment-modal__footer">
          <button type="button" className="account-secondary-action" onClick={onClose}>
            {t('account.membership.transferUnderstood')}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
