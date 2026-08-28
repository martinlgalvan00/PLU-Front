import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
 * Revalidar no pide nada: relee al proveedor y aplica lo que diga. Validar por
 * N.º de operación abre un modal conciso (antes era un form inline que rompía
 * la densidad de la fila). Acreditar a mano reusa el mismo diálogo de Finanzas
 * (comprobante + motivo obligatorios); no se relaja ninguna regla por mostrarse
 * en otra pantalla.
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
  const lookupTitleId = useId()
  const lookupDescriptionId = useId()
  const lookupInputId = useId()
  const lookupPanelRef = useRef(null)
  const lookupStateRef = useRef({ revalidating, onClose: null })

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
      if (explicitPaymentId) {
        setLookupOpen(false)
        setProviderPaymentId('')
      }
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

  function closeLookup() {
    if (revalidating) return
    setLookupOpen(false)
    setProviderPaymentId('')
  }

  lookupStateRef.current = { revalidating, onClose: closeLookup }

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
            onClick={() => setLookupOpen(true)}
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
        <PaymentLookupDialog
          busy={revalidating}
          descriptionId={lookupDescriptionId}
          inputId={lookupInputId}
          panelRef={lookupPanelRef}
          providerPaymentId={providerPaymentId}
          stateRef={lookupStateRef}
          titleId={lookupTitleId}
          onCancel={closeLookup}
          onChangeId={(value) => setProviderPaymentId(value.replace(/\D/g, ''))}
          onSubmit={() => {
            const id = providerPaymentId.trim()
            if (id) void revalidate(id)
          }}
        />
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

function PaymentLookupDialog({
  busy,
  descriptionId,
  inputId,
  onCancel,
  onChangeId,
  onSubmit,
  panelRef,
  providerPaymentId,
  stateRef,
  titleId,
}) {
  const { t } = useI18n()

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector('input')?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !stateRef.current.revalidating) {
        event.preventDefault()
        stateRef.current.onClose?.()
        return
      }
      if (event.key !== 'Tab') return
      const focusable =
        panelRef.current?.querySelectorAll(
          'button:not(:disabled), input:not(:disabled)',
        ) ?? []
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus?.()
    }
  }, [panelRef, stateRef])

  return createPortal(
    <div className="admin-user-delete-dialog">
      <button
        type="button"
        className="admin-user-delete-dialog__backdrop"
        aria-label={t('admin.athletePayments.lookupPaymentClose')}
        disabled={busy}
        onClick={onCancel}
      />
      <section
        ref={panelRef}
        className="admin-user-delete-dialog__panel payment-lookup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <span className="admin-user-delete-dialog__icon" aria-hidden>
          <Hash size={19} />
        </span>
        <form
          className="payment-lookup-dialog__form"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          <div className="admin-user-delete-dialog__copy">
            <h2 id={titleId}>{t('admin.athletePayments.lookupPayment')}</h2>
            <p id={descriptionId}>{t('admin.athletePayments.lookupPaymentHint')}</p>
            <div className="membership-manual-dialog__field">
              <label htmlFor={inputId}>{t('admin.athletePayments.lookupPaymentLabel')}</label>
              <input
                id={inputId}
                inputMode="numeric"
                minLength={1}
                pattern="[0-9]*"
                value={providerPaymentId}
                disabled={busy}
                autoComplete="off"
                onChange={(event) => onChangeId(event.target.value)}
              />
            </div>
          </div>
          <div className="admin-user-delete-dialog__actions">
            <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
              {t('admin.athletePayments.lookupPaymentBack')}
            </Button>
            <Button type="submit" disabled={busy || !providerPaymentId.trim()}>
              {busy ? (
                <span className="plu-spinner plu-spinner--sm" aria-hidden="true" />
              ) : (
                <Hash size={15} aria-hidden />
              )}
              {busy
                ? t('admin.athletePayments.lookupPaymentBusy')
                : t('admin.athletePayments.lookupPaymentSubmit')}
            </Button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  )
}
