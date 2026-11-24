import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { Ban, LoaderCircle, RotateCcw } from 'lucide-react'
import Button from '../ui/Button.jsx'
import StatusBadge from '../ui/StatusBadge.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useAdminModal } from './useAdminModal.js'

/**
 * Las dos decisiones que deshacen otra: cancelar una orden de entradas
 * (aprobada o abierta) y volver a aceptar una rechazada o cancelada.
 *
 * El motivo es obligatorio sólo al cancelar algo ya acreditado: es lo que
 * recibe el comprador por mail, y lo único que explica en la auditoría por qué
 * un QR que funcionaba dejó de funcionar. Para una orden que nunca se cobró es
 * opcional (cerrar una reserva no le cambia nada al comprador).
 *
 * `order` es la fila de TicketOrdersSection: attendees, event, reference,
 * amount (formateado), status y los motivos previos.
 */
export default function TicketOrderLifecycleDialog({
  mode,
  order,
  busy = false,
  error = '',
  onCancel,
  onConfirm,
}) {
  const { t } = useI18n()
  const titleId = useId()
  const descriptionId = useId()
  const reasonId = useId()
  const panelRef = useAdminModal(() => {
    if (!busy) onCancel()
  })
  const [reason, setReason] = useState('')

  if (!order) return null

  const cancelling = mode === 'cancel'
  const reasonRequired = cancelling && order.status === 'aprobado'
  const reasonValid = !reasonRequired || reason.trim().length >= 3
  const previousReason = order.cancellationReason || order.rejectionReason || ''
  const Icon = cancelling ? Ban : RotateCcw

  const lead = cancelling
    ? order.status === 'aprobado'
      ? t('admin.ticketOrders.lifecycle.cancelLeadApproved')
      : t('admin.ticketOrders.lifecycle.cancelLeadOpen')
    : t('admin.ticketOrders.lifecycle.reinstateLead')

  function handleSubmit(event) {
    event.preventDefault()
    if (busy || !reasonValid) return
    onConfirm(reason.trim())
  }

  return createPortal(
    <div className="admin-status-dialog">
      <button
        type="button"
        className="admin-status-dialog__backdrop"
        aria-label={t('admin.ticketOrders.lifecycle.close')}
        disabled={busy}
        onClick={onCancel}
      />
      <form
        ref={panelRef}
        className="admin-status-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onSubmit={handleSubmit}
      >
        <header className="admin-status-dialog__head">
          <span
            className={`admin-status-dialog__icon${cancelling ? ' admin-status-dialog__icon--danger' : ''}`}
            aria-hidden
          >
            <Icon size={18} />
          </span>
          <div>
            <h2 id={titleId}>
              {cancelling
                ? t('admin.ticketOrders.lifecycle.cancelTitle')
                : t('admin.ticketOrders.lifecycle.reinstateTitle')}
            </h2>
            <p id={descriptionId} className="admin-status-dialog__lead">
              {lead}
            </p>
          </div>
        </header>

        <dl className="admin-status-dialog__meta">
          <div>
            <dt>{t('admin.ticketOrders.lifecycle.attendees')}</dt>
            <dd>{order.attendees}</dd>
          </div>
          <div>
            <dt>{t('admin.ticketOrders.lifecycle.concept')}</dt>
            <dd>
              {order.event} · <span className="data-table__mono">{order.reference}</span>
            </dd>
          </div>
          <div>
            <dt>{t('admin.ticketOrders.lifecycle.amount')}</dt>
            <dd>{order.amount}</dd>
          </div>
          <div>
            <dt>{t('admin.ticketOrders.lifecycle.current')}</dt>
            <dd>
              <StatusBadge value={order.status} />
            </dd>
          </div>
          {!cancelling && previousReason ? (
            <div>
              <dt>{t('admin.ticketOrders.lifecycle.previousReason')}</dt>
              <dd>{previousReason}</dd>
            </div>
          ) : null}
        </dl>

        {cancelling ? (
          <div className="admin-status-dialog__field">
            <label htmlFor={reasonId}>
              {reasonRequired
                ? t('admin.ticketOrders.lifecycle.reasonLabel')
                : t('admin.ticketOrders.lifecycle.reasonLabelOptional')}
            </label>
            <textarea
              id={reasonId}
              rows={3}
              maxLength={500}
              value={reason}
              disabled={busy}
              required={reasonRequired}
              placeholder={t('admin.ticketOrders.lifecycle.reasonPlaceholder')}
              onChange={(event) => setReason(event.target.value)}
            />
            {reasonRequired && !reasonValid ? (
              <small className="admin-status-dialog__hint">
                {t('admin.ticketOrders.lifecycle.reasonHint')}
              </small>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="admin-status-dialog__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="admin-status-dialog__actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            {t('admin.ticketOrders.lifecycle.back')}
          </Button>
          <Button
            type="submit"
            variant={cancelling ? 'danger' : 'primary'}
            disabled={busy || !reasonValid}
          >
            {busy ? <LoaderCircle size={15} aria-hidden className="is-spinning" /> : null}
            {busy
              ? t('admin.ticketOrders.lifecycle.working')
              : cancelling
                ? t('admin.ticketOrders.lifecycle.confirmCancel')
                : t('admin.ticketOrders.lifecycle.confirmReinstate')}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
