import { useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * Motivo para habilitar una orden pendiente o forzar este ingreso.
 * El comprobante, si hay, se pide al proxy autenticado de esa orden.
 */
export default function DoorTicketDecision({
  busy = false,
  error = '',
  kind,
  onCancel,
  onConfirm,
  onReject,
  proofOrderId = null,
}) {
  const { t } = useI18n()
  const [reason, setReason] = useState('')
  const [localError, setLocalError] = useState('')
  const [proofOpen, setProofOpen] = useState(false)
  const [proofFailed, setProofFailed] = useState(false)
  const shownError = localError || error
  const proofUrl = proofOrderId ? `/api/tickets/orders/${proofOrderId}/proof` : null

  async function submit(action) {
    const trimmed = reason.trim()
    if (trimmed.length < 8) {
      setLocalError(t('admin.checkin.decisionShort'))
      return
    }
    setLocalError('')
    await action(trimmed)
  }

  return (
    <form
      className="admin-status-dialog__field"
      onSubmit={(event) => {
        event.preventDefault()
        void submit(onConfirm)
      }}
    >
      <label htmlFor={`door-decision-${kind}`}>{t('admin.checkin.decisionReason')}</label>
      <textarea
        id={`door-decision-${kind}`}
        value={reason}
        minLength={8}
        maxLength={500}
        required
        disabled={busy}
        onChange={(event) => setReason(event.target.value)}
      />
      <p>{kind === 'force' ? t('admin.checkin.forceHint') : t('admin.checkin.decisionReasonHint')}</p>
      {proofUrl ? (
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => {
            setProofFailed(false)
            setProofOpen((open) => !open)
          }}
        >
          {proofOpen ? t('admin.checkin.hideProof') : t('admin.checkin.viewProof')}
        </button>
      ) : null}
      {proofOpen && proofUrl ? (
        proofFailed ? (
          <p role="status">{t('admin.checkin.proofMissing')}</p>
        ) : (
          <img
            alt={t('admin.checkin.viewProof')}
            src={proofUrl}
            onError={() => setProofFailed(true)}
          />
        )
      ) : null}
      {shownError ? (
        <p role="alert">{shownError}</p>
      ) : null}
      <div className="admin-checkin-result__actions">
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
          {kind === 'force' ? t('admin.checkin.forceConfirm') : t('admin.checkin.enableEntry')}
        </button>
        {kind === 'enable' && onReject ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={busy}
            onClick={() => void submit(onReject)}
          >
            {t('admin.checkin.rejectEntry')}
          </button>
        ) : null}
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={onCancel}>
          {t('admin.checkin.decisionCancel')}
        </button>
      </div>
    </form>
  )
}
