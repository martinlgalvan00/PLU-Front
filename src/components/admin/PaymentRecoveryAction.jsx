import { useState } from 'react'
import { Hash, HandCoins, ScanSearch } from 'lucide-react'
import AdminIconButton from './AdminIconButton.jsx'
import PaymentValidationDialog from './PaymentValidationDialog.jsx'
import Button from '../ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { notifyError, notifySuccess } from '../../lib/adminToast.js'
import { money } from '../../lib/format.js'
import { buildPaymentValidationItem, canForceSettleOrder } from '../../services/paymentValidationService.js'
import { revalidatePaymentOrder } from '../../services/paymentService.js'

/**
 * PaymentRecoveryAction — PLU ARG
 *
 * "La orden figura cancelada o rechazada pero la plata entró": las mismas dos
 * vías que ya existían en Finanzas (revalidar contra Mercado Pago, o acreditar
 * a mano como excepción), disponibles donde el operador ya está mirando a la
 * persona -- Inscripciones o Afiliaciones -- en vez de obligarlo a ir a buscar
 * la misma orden en otra pantalla para poder cambiarle el estado a alguien.
 *
 * Revalidar no pide nada: relee al proveedor y aplica lo que diga. Acreditar a
 * mano reusa el mismo diálogo de Finanzas (comprobante + motivo obligatorios);
 * no se relaja ninguna regla por mostrarse en otra pantalla.
 */
export default function PaymentRecoveryAction({
  order,
  athlete = null,
  detail = null,
  canForceSettle = false,
  onForceSettlePayment,
  onRefreshAthleteData,
}) {
  const { locale, t } = useI18n()
  const [revalidating, setRevalidating] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [settling, setSettling] = useState(false)
  const [settleError, setSettleError] = useState('')
  const [lookupOpen, setLookupOpen] = useState(false)
  const [providerPaymentId, setProviderPaymentId] = useState('')

  if (!order) return null

  const showRevalidate = order.method === 'mercado_pago'
  const showForceSettle = canForceSettle && canForceSettleOrder(order)
  if (!showRevalidate && !showForceSettle) return null

  async function revalidate(explicitPaymentId = null) {
    setRevalidating(true)
    try {
      const result = explicitPaymentId
        ? await revalidatePaymentOrder(order.id, { providerPaymentId: explicitPaymentId })
        : await revalidatePaymentOrder(order.id)
      notifySuccess(t(`admin.athletePayments.revalidate.${result.outcome}`))
      // La revalidación solo devuelve la orden: si corrigió el estado, la
      // afiliación/inscripción que cascadeó recién se ve pidiendo el
      // snapshot de nuevo (si no, llega igual con el polling de fondo).
      if (result.corrected || result.applied) await onRefreshAthleteData?.()
    } catch (error) {
      notifyError(error?.message ?? t('admin.athletePayments.revalidateError'))
    } finally {
      setRevalidating(false)
    }
  }

  async function settle({ reason, reference }) {
    setSettling(true)
    setSettleError('')
    try {
      const result = await onForceSettlePayment?.(order.id, { reason, reference })
      if (result?.error) {
        setSettleError(result.error)
        notifyError(result.error)
        return
      }
      setReviewOpen(false)
      notifySuccess(t('admin.toasts.paymentApproved'))
      await onRefreshAthleteData?.()
    } catch (error) {
      const message = error?.message ?? t('admin.paymentValidation.confirmError')
      setSettleError(message)
      notifyError(message)
    } finally {
      setSettling(false)
    }
  }

  const item = showForceSettle
    ? buildPaymentValidationItem(order, {
        mode: 'settle',
        athlete,
        detail,
        meta: money(order.amount, locale, order.currency),
      })
    : null

  return (
    <>
      {showRevalidate ? (
        <>
          <AdminIconButton
            disabled={revalidating}
            icon={ScanSearch}
            label={t('admin.athletePayments.revalidate.action')}
            onClick={() => void revalidate()}
            spinning={revalidating}
            variant="ghost"
          />
          <AdminIconButton
            disabled={revalidating}
            icon={Hash}
            label={t('admin.athletePayments.lookupPayment')}
            onClick={() => setLookupOpen((current) => !current)}
            variant="ghost"
          />
        </>
      ) : null}
      {showForceSettle ? (
        <AdminIconButton
          disabled={settling}
          icon={HandCoins}
          label={t('admin.athletePayments.forceSettle')}
          onClick={() => {
            setSettleError('')
            setReviewOpen(true)
          }}
          variant="ghost"
        />
      ) : null}
      {lookupOpen ? (
        <form
          className="payment-recovery-action__lookup"
          onSubmit={(event) => {
            event.preventDefault()
            const id = providerPaymentId.trim()
            if (id) void revalidate(id)
          }}
        >
          <label>
            {t('admin.athletePayments.lookupPaymentLabel')}
            <input
              inputMode="numeric"
              minLength={1}
              pattern="[0-9]*"
              value={providerPaymentId}
              disabled={revalidating}
              onChange={(event) => setProviderPaymentId(event.target.value.replace(/\D/g, ''))}
            />
          </label>
          <small>{t('admin.athletePayments.lookupPaymentHint')}</small>
          <Button type="submit" disabled={revalidating || !providerPaymentId.trim()}>
            {t('admin.athletePayments.lookupPaymentSubmit')}
          </Button>
        </form>
      ) : null}
      {reviewOpen ? (
        <PaymentValidationDialog
          item={item}
          mode="settle"
          busy={settling}
          error={settleError}
          onCancel={() => {
            if (!settling) setReviewOpen(false)
          }}
          onConfirm={(settlement) => void settle(settlement)}
        />
      ) : null}
    </>
  )
}
