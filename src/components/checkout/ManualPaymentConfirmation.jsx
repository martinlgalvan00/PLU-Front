import { useState } from 'react'
import { CheckCircle2, LoaderCircle } from 'lucide-react'
import { confirmAthleteManualPayment } from '../../services/athleteApi.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import '../../styles/components/transfer-pay-modal.css'

/** Declaracion del atleta: deja la acreditacion exclusivamente en Finanzas. */
export default function ManualPaymentConfirmation({
  orderId,
  channel = 'bank_transfer',
  financingAllowed = false,
  manualPaymentDeclaredAt = null,
  financedEntitlementsAt = null,
  onConfirmed,
}) {
  const { t } = useI18n()
  const [state, setState] = useState(manualPaymentDeclaredAt ? 'confirmed' : 'idle')
  const [granted, setGranted] = useState(Boolean(financedEntitlementsAt))
  const [error, setError] = useState('')
  const isCash = channel === 'cash_pitbull'

  async function handleConfirm() {
    if (!orderId || state === 'loading' || state === 'confirmed') return
    setState('loading')
    setError('')
    try {
      const result = await confirmAthleteManualPayment(orderId)
      const entitlementsGranted =
        result.entitlementsGranted || Boolean(result.order?.financedEntitlementsAt)
      setGranted(entitlementsGranted)
      setState('confirmed')
      window.dispatchEvent(
        new CustomEvent('plu:payment-updated', {
          detail: {
            orderId,
            status: result.order?.status ?? 'validacion_manual',
            financingAllowed: result.order?.financingAllowed === true,
            manualPaymentDeclaredAt:
              result.order?.manualPaymentDeclaredAt ?? new Date().toISOString(),
            financedEntitlementsAt: result.order?.financedEntitlementsAt ?? null,
          },
        }),
      )
      onConfirmed?.(result)
    } catch (confirmationError) {
      setState('error')
      setError(confirmationError?.message ?? t('payments.manualConfirmation.error'))
    }
  }

  if (!orderId) return null

  if (state === 'confirmed') {
    return (
      <div className="manual-payment-confirmation manual-payment-confirmation--done" role="status">
        <CheckCircle2 size={19} aria-hidden />
        <div>
          <strong>{t('payments.manualConfirmation.received')}</strong>
          <p>
            {financingAllowed && granted
              ? t('payments.manualConfirmation.financedGranted')
              : t('payments.manualConfirmation.pendingReview')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="manual-payment-confirmation">
      {financingAllowed ? (
        <p className="manual-payment-confirmation__financing">
          {t('payments.manualConfirmation.financingHint')}
        </p>
      ) : null}
      <button
        type="button"
        className="manual-payment-confirmation__action"
        disabled={state === 'loading'}
        onClick={() => void handleConfirm()}
      >
        {state === 'loading' ? (
          <LoaderCircle className="manual-payment-confirmation__spinner" size={18} aria-hidden />
        ) : (
          <CheckCircle2 size={18} aria-hidden />
        )}
        {t(
          isCash
            ? 'payments.manualConfirmation.cashAction'
            : 'payments.manualConfirmation.transferAction',
        )}
      </button>
      <p className="manual-payment-confirmation__legal">
        {t('payments.manualConfirmation.notApproval')}
      </p>
      {error ? (
        <p className="manual-payment-confirmation__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
