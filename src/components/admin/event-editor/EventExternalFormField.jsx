import { useEffect, useState } from 'react'
import { ClipboardList, Copy, Download, QrCode } from 'lucide-react'
import { useI18n } from '../../../i18n/I18nProvider.jsx'
import { notifyError, notifySuccess } from '../../../lib/adminToast.js'
import { generateCredentialQr } from '../../../lib/credentialQr.js'
import {
  EXTERNAL_FORM_LABEL_MAX,
  EXTERNAL_FORM_URL_MAX,
  normalizeExternalFormUrl,
} from '../../../lib/eventExternalForm.js'
import { FormField } from './parts.jsx'

/**
 * Formulario de Google del evento: el staff pega el link, ve el QR que se va a
 * imprimir y lo descarga. El sitio público muestra el botón y el mismo QR
 * (`EventPublicMaterials`).
 */
export default function EventExternalFormField({ canEdit, draft, err, patchDraft }) {
  const { t } = useI18n()
  const base = 'admin.eventEditor'
  const form = draft.externalForm ?? { url: '', label: '' }
  const checked = normalizeExternalFormUrl(form.url)
  const validUrl = checked.ok ? checked.url : ''
  const [qrSrc, setQrSrc] = useState('')
  const [qrFailed, setQrFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setQrSrc('')
    setQrFailed(false)
    if (!validUrl) return undefined
    generateCredentialQr(validUrl)
      .then((dataUrl) => {
        if (!cancelled) setQrSrc(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setQrFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [validUrl])

  async function copyLink() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(validUrl)
      notifySuccess(t(`${base}.externalFormCopied`))
    } catch {
      notifyError(t(`${base}.externalFormCopyFailed`))
    }
  }

  function downloadQr() {
    if (!qrSrc) return
    const link = document.createElement('a')
    link.href = qrSrc
    link.download = `formulario-${draft.slug || 'evento'}-qr.png`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const urlError = err('externalForm.url')

  return (
    <div className="admin-event-form__external-form">
      <div className="admin-event-form__ticket-config-summary admin-event-form__ticket-config-summary--static">
        <span>
          <strong>
            <ClipboardList size={13} aria-hidden />
            {t(`${base}.externalFormTitle`)}
          </strong>
          <small>{t(`${base}.externalFormHint`)}</small>
        </span>
      </div>
      <div className="admin-event-form__grid">
        <FormField
          wide
          htmlFor="event-external-form-url"
          label={t(`${base}.externalFormUrl`)}
          error={urlError}
        >
          <input
            id="event-external-form-url"
            name="externalFormUrl"
            data-field="externalForm.url"
            type="url"
            inputMode="url"
            maxLength={EXTERNAL_FORM_URL_MAX}
            placeholder="https://forms.gle/…"
            value={form.url ?? ''}
            aria-invalid={Boolean(urlError)}
            disabled={!canEdit}
            onChange={(event) =>
              patchDraft({ ...draft, externalForm: { ...form, url: event.target.value } })
            }
          />
        </FormField>
        <FormField
          htmlFor="event-external-form-label"
          label={t(`${base}.externalFormLabel`)}
          error={err('externalForm.label')}
        >
          <input
            id="event-external-form-label"
            name="externalFormLabel"
            data-field="externalForm.label"
            type="text"
            maxLength={EXTERNAL_FORM_LABEL_MAX}
            placeholder={t(`${base}.externalFormLabelPlaceholder`)}
            value={form.label ?? ''}
            disabled={!canEdit}
            onChange={(event) =>
              patchDraft({ ...draft, externalForm: { ...form, label: event.target.value } })
            }
          />
        </FormField>
      </div>

      {validUrl ? (
        <div className="admin-event-form__external-form-qr" aria-busy={!qrSrc && !qrFailed}>
          <div className="admin-event-form__external-form-code">
            {qrSrc ? (
              <img alt={t(`${base}.externalFormQrAlt`)} src={qrSrc} />
            ) : (
              <QrCode aria-hidden size={36} strokeWidth={1.5} />
            )}
          </div>
          <div className="admin-event-form__external-form-actions">
            {qrFailed ? (
              <p className="admin-event-form__notice" role="status">
                {t(`${base}.externalFormQrFailed`)}
              </p>
            ) : null}
            <button className="button button--ghost" disabled={!qrSrc} type="button" onClick={downloadQr}>
              <Download size={14} aria-hidden />
              {t(`${base}.externalFormQrDownload`)}
            </button>
            <button className="button button--ghost" type="button" onClick={copyLink}>
              <Copy size={14} aria-hidden />
              {t(`${base}.externalFormCopy`)}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
