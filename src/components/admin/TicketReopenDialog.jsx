import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { BadgeCheck } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useAdminModal } from './useAdminModal.js'

const MIN_REASON_LENGTH = 8

/**
 * Orden de entradas que el vencimiento canceló con el comprobante cargado.
 * Acreditar la deja paga en un paso. Reabrir la devuelve a la cola, sin mail.
 */
export default function TicketReopenDialog({
  order,
  busy = false,
  error = '',
  onCancel,
  onSettle,
  onReopen,
}) {
  const { t } = useI18n()
  const titleId = useId()
  const descriptionId = useId()
  const reasonId = useId()
  const panelRef = useAdminModal(() => {
    if (!busy) onCancel()
  })
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()
  const canConfirm = trimmed.length >= MIN_REASON_LENGTH && !busy

  if (!order) return null

  return createPortal(
    <div className="admin-status-dialog">
      <button
        type="button"
        className="admin-status-dialog__backdrop"
        aria-label={t('admin.ticketOrders.reopenClose')}
        disabled={busy}
        onClick={onCancel}
      />
      <section
        ref={panelRef}
        className="admin-status-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="admin-status-dialog__head">
          <span className="admin-status-dialog__icon" aria-hidden>
            <BadgeCheck size={18} />
          </span>
          <div>
            <h2 id={titleId}>{t('admin.ticketOrders.settleTitle')}</h2>
            <p id={descriptionId} className="admin-status-dialog__lead">
              {t('admin.ticketOrders.settleLead')}
            </p>
          </div>
        </header>

        <dl className="admin-status-dialog__meta">
          <div>
            <dt>{t('admin.ticketOrders.reopenAttendee')}</dt>
            <dd>{order.attendees}</dd>
          </div>
          <div>
            <dt>{t('admin.ticketOrders.reopenReference')}</dt>
            <dd>{order.reference}</dd>
          </div>
        </dl>

        <div className="admin-status-dialog__field">
          <label htmlFor={reasonId}>{t('admin.ticketOrders.settleReason')}</label>
          <textarea
            id={reasonId}
            rows={3}
            value={reason}
            disabled={busy}
            placeholder={t('admin.ticketOrders.settleReasonPlaceholder')}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>

        {error ? <p className="form-submit-error">{error}</p> : null}

        <div className="admin-status-dialog__actions">
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={!canConfirm}
            onClick={() => onReopen(trimmed)}
          >
            {t('admin.ticketOrders.reopenConfirm')}
          </Button>
          <Button type="button" disabled={!canConfirm} onClick={() => onSettle(trimmed)}>
            {t('admin.ticketOrders.settleConfirm')}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
