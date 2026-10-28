import { useState } from 'react'
import { Mail, QrCode } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { notifyError, notifySuccess } from '../../lib/adminToast.js'
import { sendEventCredentials } from '../../services/athleteApi.js'

/**
 * Credenciales de ingreso del evento: cada confirmado ya tiene su QR en el
 * perfil; esto le manda el mail con el QR adjunto. Dos pasos a propósito
 * (contar, confirmar): es un envío masivo y el número tiene que estar a la
 * vista antes de apretar. Repetirlo no duplica: el servidor omite a quien ya
 * lo recibió.
 */
export default function AdminEventCredentialSend({ eventSlug }) {
  const { t } = useI18n()
  const text = (key, params) => t(`admin.eventRegistrations.credentials.${key}`, params)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)

  async function count() {
    setBusy(true)
    try {
      setPreview(await sendEventCredentials(eventSlug, { dryRun: true }))
    } catch (error) {
      notifyError(error?.message || text('error'))
    } finally {
      setBusy(false)
    }
  }

  async function send() {
    setBusy(true)
    try {
      const result = await sendEventCredentials(eventSlug)
      setPreview(null)
      if (result.failed > 0) {
        notifyError(text('partial', { sent: result.sent, failed: result.failed }))
      } else {
        notifySuccess(text('done', { sent: result.sent, already: result.already }))
      }
    } catch (error) {
      notifyError(error?.message || text('error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-event-credentials" aria-labelledby="admin-event-credentials-title">
      <QrCode aria-hidden className="admin-event-credentials__icon" size={20} strokeWidth={1.6} />
      <div className="admin-event-credentials__copy">
        <h3 id="admin-event-credentials-title">{text('title')}</h3>
        <p>{preview ? text('confirmLead', preview) : text('lead')}</p>
        {preview && (preview.blocked > 0 || preview.noEmail > 0) ? (
          <p className="admin-event-credentials__note">
            {[
              preview.blocked > 0 ? text('blocked', { count: preview.blocked }) : '',
              preview.noEmail > 0 ? text('noEmail', { count: preview.noEmail }) : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}
      </div>
      <div className="admin-event-credentials__actions">
        {preview ? (
          <>
            <button
              className="admin-event-regs__export"
              disabled={busy}
              type="button"
              onClick={() => setPreview(null)}
            >
              {t('common.cancel')}
            </button>
            <button
              className="admin-event-credentials__send"
              disabled={busy || preview.ready === 0}
              type="button"
              onClick={() => void send()}
            >
              <Mail aria-hidden size={14} />
              {text('confirm', { count: preview.ready })}
            </button>
          </>
        ) : (
          <button
            className="admin-event-credentials__send"
            disabled={busy}
            type="button"
            onClick={() => void count()}
          >
            <Mail aria-hidden size={14} />
            {text('action')}
          </button>
        )}
      </div>
    </section>
  )
}
