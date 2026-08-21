import { useState } from 'react'
import { BadgeCheck } from 'lucide-react'
import AdminIconButton from './AdminIconButton.jsx'
import PaymentValidationDialog from './PaymentValidationDialog.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { notifyError, notifySuccess } from '../../lib/adminToast.js'
import { money } from '../../lib/format.js'
import { buildPaymentValidationItem } from '../../services/paymentValidationService.js'

/**
 * PaymentValidationAction — PLU ARG
 *
 * Validar un cobro manual desde donde el operador ya está, con el mismo rigor
 * que en Finanzas: el comprobante se abre antes de decidir y el rechazo pide
 * motivo. Es un botón de fila más su diálogo, para poder montarlo en cualquier
 * tabla del panel sin que cada sección vuelva a escribir el estado del modal.
 *
 * No relaja ninguna regla: el permiso lo decide quien lo monta
 * (`admin.payments.approve`), la elegibilidad la calcula
 * `paymentValidationService` y la última palabra sigue siendo la RPC.
 */
export default function PaymentValidationAction({
  order,
  athlete = null,
  detail = null,
  disabled = false,
  label = null,
  onApprove,
  onReject,
  onDone,
}) {
  const { locale, t } = useI18n()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!order) return null

  const item = buildPaymentValidationItem(order, {
    athlete,
    detail,
    meta: money(order.amount, locale, order.currency),
  })

  function close() {
    if (busy) return
    setOpen(false)
    setError('')
  }

  async function run(action, successMessage) {
    setBusy(true)
    setError('')
    try {
      const result = await action()
      if (result?.error) {
        setError(result.error)
        notifyError(result.error)
        return
      }
      setOpen(false)
      notifySuccess(successMessage)
      onDone?.(result)
    } catch (actionError) {
      const message = actionError?.message ?? t('admin.paymentValidation.confirmError')
      setError(message)
      notifyError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <AdminIconButton
        disabled={disabled || busy}
        icon={BadgeCheck}
        label={label ?? t('admin.actions.validate')}
        onClick={() => {
          setError('')
          setOpen(true)
        }}
        variant="celeste"
      />
      {open ? (
        <PaymentValidationDialog
          item={item}
          busy={busy}
          error={error}
          onCancel={close}
          onConfirm={() =>
            void run(() => onApprove?.(order.id), t('admin.toasts.paymentApproved'))
          }
          onReject={
            onReject
              ? (reason) =>
                  void run(() => onReject(order.id, reason), t('admin.toasts.paymentRejected'))
              : undefined
          }
        />
      ) : null}
    </>
  )
}
