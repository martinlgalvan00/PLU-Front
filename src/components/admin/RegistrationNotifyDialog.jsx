import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { Eye, LoaderCircle, Mail } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useAdminModal } from './useAdminModal.js'

/**
 * Aviso manual por mail a una inscripción cancelada: el motivo de la baja o
 * un recordatorio de que el lugar sigue libre. Nunca automático -- lo dispara
 * el operador a propósito, calcado del flujo de `RegistrationStatusDialog`
 * pero sin tocar el estado de la inscripción.
 *
 * El mensaje es siempre opcional: si no hay nada escrito, el backend usa el
 * motivo guardado al cancelar (o un aviso genérico si tampoco hay eso). Así
 * el caso común -- avisar sin escribir nada -- queda en un solo click.
 */
const NOTIFY_TYPES = ['registration_cancelled', 'registration_reminder']

export default function RegistrationNotifyDialog({
  registration,
  busy = false,
  error = '',
  result = null,
  onCancel,
  onConfirm,
  onPreview,
}) {
  const { t } = useI18n()
  const titleId = useId()
  const descriptionId = useId()
  const messageId = useId()
  const groupId = useId()
  const panelRef = useAdminModal(() => {
    if (!busy) onCancel()
  })
  const [type, setType] = useState('registration_cancelled')
  const [message, setMessage] = useState(registration?.reasonHint ?? '')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [preview, setPreview] = useState(null)
  const [previewError, setPreviewError] = useState('')

  // El borrador que se ve no tiene por qué coincidir con el último draft
  // previsualizado: si cambió el tipo o el texto, la vista previa vieja queda
  // obsoleta y hay que volver a pedirla antes de confiar en ella.
  useEffect(() => {
    setPreview(null)
    setPreviewError('')
  }, [type, message])

  if (!registration) return null

  function handleTypeChange(nextType) {
    setType(nextType)
    if (nextType === 'registration_cancelled' && !message) {
      setMessage(registration.reasonHint ?? '')
    }
  }

  async function handlePreview() {
    if (!onPreview || previewLoading) return
    setPreviewLoading(true)
    setPreviewError('')
    try {
      const response = await onPreview(type, message.trim())
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
        aria-label={t('admin.registrationNotify.close')}
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
            <Mail size={18} />
          </span>
          <div>
            <h2 id={titleId}>{t('admin.registrationNotify.title')}</h2>
            <p id={descriptionId} className="admin-status-dialog__lead">
              {t('admin.registrationNotify.lead')}
            </p>
          </div>
        </header>

        <dl className="admin-status-dialog__meta">
          <div>
            <dt>{t('admin.registrationNotify.athlete')}</dt>
            <dd>{registration.athlete}</dd>
          </div>
          <div>
            <dt>{t('admin.registrationNotify.event')}</dt>
            <dd>{registration.event}</dd>
          </div>
        </dl>

        <fieldset className="admin-status-dialog__options">
          <legend id={groupId}>{t('admin.registrationNotify.typeLabel')}</legend>
          {NOTIFY_TYPES.map((option) => (
            <label
              key={option}
              className={`admin-status-dialog__option${type === option ? ' is-selected' : ''}`}
            >
              <input
                type="radio"
                name={groupId}
                value={option}
                checked={type === option}
                disabled={busy}
                onChange={() => handleTypeChange(option)}
              />
              <span className="admin-status-dialog__option-body">
                <strong>{t(`admin.registrationNotify.${option === 'registration_cancelled' ? 'typeCancelled' : 'typeReminder'}`)}</strong>
                <small>
                  {t(
                    `admin.registrationNotify.${
                      option === 'registration_cancelled' ? 'typeCancelledHelp' : 'typeReminderHelp'
                    }`,
                  )}
                </small>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="admin-status-dialog__field">
          <label htmlFor={messageId}>{t('admin.registrationNotify.messageLabel')}</label>
          <textarea
            id={messageId}
            rows={3}
            value={message}
            disabled={busy}
            placeholder={t('admin.registrationNotify.messagePlaceholder')}
            onChange={(event) => setMessage(event.target.value)}
          />
          <small className="admin-status-dialog__hint">
            {t(
              `admin.registrationNotify.${type === 'registration_cancelled' ? 'messageHint' : 'messageHintOptional'}`,
            )}
          </small>
        </div>

        {onPreview ? (
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
              {previewLoading ? t('admin.registrationNotify.previewLoading') : t('admin.registrationNotify.preview')}
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

        {result ? (
          <p
            className={`admin-status-dialog__${result.status === 'sent' ? 'hint' : 'error'}`}
            role={result.status === 'sent' ? 'status' : 'alert'}
          >
            {result.status === 'sent'
              ? t('admin.registrationNotify.resultSent')
              : result.status === 'skipped'
                ? t('admin.registrationNotify.resultSkipped', { reason: result.reason ?? '' })
                : t('admin.registrationNotify.resultFailed')}
          </p>
        ) : null}

        {error ? (
          <p className="admin-status-dialog__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="admin-status-dialog__actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            {t('admin.registrationNotify.cancel')}
          </Button>
          <Button type="button" disabled={busy} onClick={() => onConfirm(type, message.trim())}>
            {busy ? (
              <LoaderCircle size={15} aria-hidden className="is-spinning" />
            ) : (
              <Mail size={15} aria-hidden />
            )}
            {busy ? t('admin.registrationNotify.sending') : t('admin.registrationNotify.send')}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
