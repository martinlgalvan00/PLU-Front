import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { LoaderCircle, Users } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useAdminModal } from './useAdminModal.js'

/**
 * Corrección masiva del estado de varias inscripciones a la vez -- pensado
 * para vaciar de un lote las que quedaron `pendiente_pago` sin completar el
 * pago: filtrar por ese estado, seleccionar todas y cancelarlas juntas en vez
 * de abrir el diálogo fila por fila.
 *
 * Mismo motivo para todas las filas (no hay forma de escribir uno distinto
 * por persona en un lote), y el mismo motivo sirve de mensaje si se avisa por
 * mail -- igual que en la corrección individual.
 */
const STATUS_OPTIONS = ['confirmada', 'observada', 'cancelada']

export default function AdminBulkRegistrationStatusDialog({
  count,
  busy = false,
  error = '',
  onCancel,
  onConfirm,
}) {
  const { t } = useI18n()
  const titleId = useId()
  const descriptionId = useId()
  const reasonId = useId()
  const groupId = useId()
  const panelRef = useAdminModal(() => {
    if (!busy) onCancel()
  })
  const [status, setStatus] = useState('cancelada')
  const [reason, setReason] = useState('')
  const [notify, setNotify] = useState(false)
  const reasonValid = reason.trim().length >= 3

  return createPortal(
    <div className="admin-status-dialog">
      <button
        type="button"
        className="admin-status-dialog__backdrop"
        aria-label={t('admin.registrationBulkStatus.close')}
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
            <Users size={18} />
          </span>
          <div>
            <h2 id={titleId}>{t('admin.registrationBulkStatus.title', { count })}</h2>
            <p id={descriptionId} className="admin-status-dialog__lead">
              {t('admin.registrationBulkStatus.lead')}
            </p>
          </div>
        </header>

        <fieldset className="admin-status-dialog__options">
          <legend id={groupId}>{t('admin.registrationStatus.newStatus')}</legend>
          {STATUS_OPTIONS.map((option) => (
            <label
              key={option}
              className={`admin-status-dialog__option${status === option ? ' is-selected' : ''}`}
            >
              <input
                type="radio"
                name={groupId}
                value={option}
                checked={status === option}
                disabled={busy}
                onChange={() => setStatus(option)}
              />
              <span className="admin-status-dialog__option-body">
                <strong>{t(`admin.registrationStatus.help.${option}`)}</strong>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="admin-status-dialog__field">
          <label htmlFor={reasonId}>{t('admin.registrationStatus.reasonLabel')}</label>
          <textarea
            id={reasonId}
            rows={3}
            value={reason}
            disabled={busy}
            required
            placeholder={t('admin.registrationBulkStatus.reasonPlaceholder')}
            onChange={(event) => setReason(event.target.value)}
          />
          <small className="admin-status-dialog__hint">
            {t('admin.registrationBulkStatus.reasonHint', { count })}
          </small>
        </div>

        {status === 'cancelada' ? (
          <div className="admin-status-dialog__field">
            <label className="admin-status-dialog__checkbox">
              <input
                type="checkbox"
                checked={notify}
                disabled={busy}
                onChange={(event) => setNotify(event.target.checked)}
              />
              <span>{t('admin.registrationBulkStatus.notifyLabel', { count })}</span>
            </label>
            <small className="admin-status-dialog__hint">
              {t('admin.registrationBulkStatus.notifyHint')}
            </small>
          </div>
        ) : null}

        {error ? (
          <p className="admin-status-dialog__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="admin-status-dialog__actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            {t('admin.registrationBulkStatus.cancel')}
          </Button>
          <Button
            type="button"
            disabled={busy || !reasonValid}
            onClick={() => onConfirm(status, reason.trim(), notify)}
          >
            {busy ? <LoaderCircle size={15} aria-hidden className="is-spinning" /> : <Users size={15} aria-hidden />}
            {busy
              ? t('admin.registrationBulkStatus.saving')
              : t('admin.registrationBulkStatus.confirm', { count })}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
