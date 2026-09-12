import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { Eye, LoaderCircle, PencilLine } from 'lucide-react'
import Button from '../ui/Button.jsx'
import StatusBadge from '../ui/StatusBadge.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useAdminModal } from './useAdminModal.js'

/**
 * Corrección manual del estado de una inscripción.
 *
 * Antes la única forma de arreglar una inscripción mal cancelada era borrarla y
 * pedirle al atleta que se anotara de nuevo, perdiendo división, categoría y
 * horario ya asignados. El motivo es obligatorio porque este cambio no lo
 * respalda ningún pago ni ningún proveedor: lo único que lo explica es lo que
 * escriba el operador, y queda firmado con su usuario en la auditoría.
 *
 * Los tres estados son los que el panel puede corregir; `borrador` y
 * `pendiente_pago` quedan afuera a propósito para no pisar el flujo de
 * checkout, que tiene su propia reanudación.
 *
 * Al cancelar, el mismo motivo puede mandarse por mail en el mismo paso
 * (checkbox "Avisar por mail", con vista previa antes de confirmar) en vez de
 * exigir una segunda visita a la fila para avisarle al atleta.
 */
const STATUS_OPTIONS = ['confirmada', 'observada', 'cancelada']

export default function RegistrationStatusDialog({
  registration,
  busy = false,
  error = '',
  onCancel,
  onConfirm,
  onPreview,
}) {
  const { t } = useI18n()
  const titleId = useId()
  const descriptionId = useId()
  const reasonId = useId()
  const groupId = useId()
  const panelRef = useAdminModal(() => {
    if (!busy) onCancel()
  })
  const [status, setStatus] = useState(
    () => STATUS_OPTIONS.find((option) => option !== registration?.status) ?? 'confirmada',
  )
  const [reason, setReason] = useState('')
  const [notify, setNotify] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [preview, setPreview] = useState(null)
  const [previewError, setPreviewError] = useState('')
  const reasonValid = reason.trim().length >= 3

  // Salir de "cancelada" descarta la intención de avisar: no tiene sentido
  // arrastrar el checkbox a un estado donde no se ofrece.
  useEffect(() => {
    if (status !== 'cancelada') {
      setNotify(false)
      setPreview(null)
      setPreviewError('')
    }
  }, [status])

  // El motivo mostrado en la vista previa tiene que ser el que se va a
  // mandar: si cambió desde la última vez que se pidió, queda obsoleta.
  useEffect(() => {
    setPreview(null)
    setPreviewError('')
  }, [reason])

  if (!registration) return null

  async function handlePreview() {
    if (!onPreview || previewLoading) return
    setPreviewLoading(true)
    setPreviewError('')
    try {
      const response = await onPreview('registration_cancelled', reason.trim())
      if (response?.error) {
        setPreviewError(response.error)
        return
      }
      setPreview(response)
    } catch (err) {
      setPreviewError(err?.message ?? t('admin.registrationNotify.previewError'))
    } finally {
      setPreviewLoading(false)
    }
  }

  return createPortal(
    <div className="admin-status-dialog">
      <button
        type="button"
        className="admin-status-dialog__backdrop"
        aria-label={t('admin.registrationStatus.close')}
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
            <PencilLine size={18} />
          </span>
          <div>
            <h2 id={titleId}>{t('admin.registrationStatus.title')}</h2>
            <p id={descriptionId} className="admin-status-dialog__lead">
              {t('admin.registrationStatus.lead')}
            </p>
          </div>
        </header>

        <dl className="admin-status-dialog__meta">
          <div>
            <dt>{t('admin.registrationStatus.athlete')}</dt>
            <dd>{registration.athlete}</dd>
          </div>
          <div>
            <dt>{t('admin.registrationStatus.event')}</dt>
            <dd>{registration.event}</dd>
          </div>
          <div>
            <dt>{t('admin.registrationStatus.current')}</dt>
            <dd>
              <StatusBadge value={registration.status} />
            </dd>
          </div>
        </dl>

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
                disabled={busy || option === registration.status}
                onChange={() => setStatus(option)}
              />
              <span className="admin-status-dialog__option-body">
                <StatusBadge value={option} />
                <small>{t(`admin.registrationStatus.help.${option}`)}</small>
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
            placeholder={t('admin.registrationStatus.reasonPlaceholder')}
            onChange={(event) => setReason(event.target.value)}
          />
          {!reasonValid ? (
            <small className="admin-status-dialog__hint">
              {t('admin.registrationStatus.reasonHint')}
            </small>
          ) : null}
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
              <span>{t('admin.registrationStatus.notifyLabel')}</span>
            </label>
            <small className="admin-status-dialog__hint">
              {t('admin.registrationStatus.notifyHint')}
            </small>

            {notify && onPreview ? (
              <div className="admin-registration-notify__preview-block">
                <Button
                  type="button"
                  variant="secondary"
                  className="btn--small"
                  disabled={busy || previewLoading}
                  onClick={handlePreview}
                >
                  {previewLoading ? (
                    <LoaderCircle size={14} aria-hidden className="is-spinning" />
                  ) : (
                    <Eye size={14} aria-hidden />
                  )}
                  {previewLoading
                    ? t('admin.registrationNotify.previewLoading')
                    : t('admin.registrationNotify.preview')}
                </Button>

                {previewError ? (
                  <p className="admin-status-dialog__error" role="alert">
                    {previewError}
                  </p>
                ) : null}

                {preview && preview.available === false ? (
                  <p className="admin-status-dialog__hint">
                    {t('admin.registrationNotify.previewUnavailable', { reason: preview.reason ?? '' })}
                  </p>
                ) : null}

                {preview && preview.available !== false ? (
                  <div className="admin-registration-notify__preview">
                    <p className="admin-registration-notify__preview-meta">
                      <strong>{t('admin.registrationNotify.previewTo')}:</strong> {preview.to}
                    </p>
                    <p className="admin-registration-notify__preview-meta">
                      <strong>{t('admin.registrationNotify.previewSubject')}:</strong> {preview.subject}
                    </p>
                    <iframe
                      title={t('admin.registrationNotify.preview')}
                      srcDoc={preview.html}
                      className="admin-registration-notify__preview-frame"
                    />
                  </div>
                ) : null}
              </div>
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
            {t('admin.registrationStatus.cancel')}
          </Button>
          <Button
            type="button"
            disabled={busy || !reasonValid || status === registration.status}
            onClick={() => onConfirm(status, reason.trim(), notify)}
          >
            {busy ? (
              <LoaderCircle size={15} aria-hidden className="is-spinning" />
            ) : (
              <PencilLine size={15} aria-hidden />
            )}
            {busy ? t('admin.registrationStatus.saving') : t('admin.registrationStatus.confirm')}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
