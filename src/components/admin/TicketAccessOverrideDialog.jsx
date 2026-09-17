import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { LoaderCircle, ShieldPlus } from 'lucide-react'
import Button from '../ui/Button.jsx'
import DateTimeLocalInput from '../ui/DateTimeLocalInput.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useAdminModal } from './useAdminModal.js'

/**
 * Excepción individual de acceso sobre una entrada ya emitida. Nunca
 * reemite el QR (`staff_set_ticket_access_override`): sólo reemplaza, para
 * esa entrada puntual, la ventana que resolvería su política de vigencia.
 * Se abre desde una fila rechazada del informe de escaneos porque ese es el
 * momento en que el staff necesita esta herramienta -- ver un QR vencido o
 * "todavía no habilitado" en la puerta.
 */
export default function TicketAccessOverrideDialog({ row, busy = false, error = '', onCancel, onConfirm }) {
  const { t } = useI18n()
  const titleId = useId()
  const leadId = useId()
  const panelRef = useAdminModal(() => {
    if (!busy) onCancel()
  })
  const [enabled, setEnabled] = useState(true)
  const [validFrom, setValidFrom] = useState('')
  const [validUntil, setValidUntil] = useState('')

  if (!row) return null

  const windowValid = Boolean(validFrom) && Boolean(validUntil) && validFrom < validUntil
  const canSubmit = !enabled || windowValid

  function handleConfirm() {
    onConfirm({
      enabled,
      validFrom: enabled && validFrom ? new Date(validFrom).toISOString() : null,
      validUntil: enabled && validUntil ? new Date(validUntil).toISOString() : null,
    })
  }

  return createPortal(
    <div className="admin-status-dialog">
      <button
        type="button"
        className="admin-status-dialog__backdrop"
        aria-label={t('admin.eventEditor.security.scanReport.accessOverride.close')}
        disabled={busy}
        onClick={onCancel}
      />
      <section
        ref={panelRef}
        className="admin-status-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={leadId}
      >
        <header className="admin-status-dialog__head">
          <span className="admin-status-dialog__icon" aria-hidden>
            <ShieldPlus size={18} />
          </span>
          <div>
            <h2 id={titleId}>{t('admin.eventEditor.security.scanReport.accessOverride.title')}</h2>
            <p id={leadId} className="admin-status-dialog__lead">
              {t('admin.eventEditor.security.scanReport.accessOverride.lead')}
            </p>
          </div>
        </header>

        <dl className="admin-status-dialog__meta">
          <div>
            <dt>{t('admin.eventEditor.security.scanReport.columnCredential')}</dt>
            <dd>{row.credentialLabel || row.ticketTypeName || row.ticketCode || '—'}</dd>
          </div>
          {row.ticketCode ? (
            <div>
              <dt>{t('admin.eventEditor.security.scanReport.accessOverride.ticketCode')}</dt>
              <dd>{row.ticketCode}</dd>
            </div>
          ) : null}
        </dl>

        <label className="admin-status-dialog__checkbox">
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          <span>{t('admin.eventEditor.security.scanReport.accessOverride.enableLabel')}</span>
        </label>
        <small className="admin-status-dialog__hint">
          {t(
            enabled
              ? 'admin.eventEditor.security.scanReport.accessOverride.enableHintOn'
              : 'admin.eventEditor.security.scanReport.accessOverride.enableHintOff',
          )}
        </small>

        {enabled ? (
          <div className="admin-event-form__grid">
            <label className="admin-event-form__field">
              <span>{t('admin.eventEditor.security.scanReport.accessOverride.validFrom')}</span>
              <DateTimeLocalInput value={validFrom} disabled={busy} onChange={(event) => setValidFrom(event.target.value)} />
            </label>
            <label className="admin-event-form__field">
              <span>{t('admin.eventEditor.security.scanReport.accessOverride.validUntil')}</span>
              <DateTimeLocalInput value={validUntil} disabled={busy} onChange={(event) => setValidUntil(event.target.value)} />
            </label>
          </div>
        ) : null}
        {enabled && !windowValid ? (
          <small className="admin-status-dialog__hint">
            {t('admin.eventEditor.security.scanReport.accessOverride.windowHint')}
          </small>
        ) : null}

        {error ? (
          <p className="admin-status-dialog__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="admin-status-dialog__actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="button" disabled={busy || !canSubmit} onClick={handleConfirm}>
            {busy ? (
              <LoaderCircle size={15} aria-hidden className="is-spinning" />
            ) : (
              <ShieldPlus size={15} aria-hidden />
            )}
            {busy
              ? t('admin.eventEditor.security.scanReport.accessOverride.saving')
              : t('admin.eventEditor.security.scanReport.accessOverride.confirm')}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
