import { useState } from 'react'
import { Bell, Lock, Pencil, X } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  PROFILE_NOTICE_BULK_MAX,
  PROFILE_NOTICE_MESSAGE_MAX,
} from '../../../shared/profileNotice.js'

/**
 * Toolbar contextual de acciones en bloque para AthletesSection — aparece
 * cuando hay filas seleccionadas. Dos acciones reales hoy: editar
 * Estado/Gimnasio en lote, o bloquear (atajo de la misma edición con
 * status: 'bloqueado'). No hay borrado en bloque: el único borrado de
 * atleta sigue siendo el hard-delete de a uno, desde la ficha. Avisar
 * perfil incompleto es la acción destacada cuando hay selección.
 */
export default function AdminAthletesBulkBar({
  selectedIds = [],
  statusFieldOptions = [],
  onBulkUpdate,
  onNotifyIncomplete,
  notifyPreset = '',
  incompleteSelectedCount,
  completeSelectedCount = 0,
  notifyAthleteIds,
  notifyMissingFields = '',
  onClearSelection,
}) {
  const { t } = useI18n()
  const [mode, setMode] = useState('idle') // idle | edit | block-confirm | notify-confirm
  const [field, setField] = useState('status')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [noticeDraft, setNoticeDraft] = useState('')
  const [notifyProgress, setNotifyProgress] = useState(null)

  const selectedCount = selectedIds.length
  const notifyIds = notifyAthleteIds ?? selectedIds
  const notifyTargetCount =
    typeof incompleteSelectedCount === 'number' ? incompleteSelectedCount : notifyIds.length
  const notifyBatches =
    notifyTargetCount > 0 ? Math.ceil(notifyTargetCount / PROFILE_NOTICE_BULK_MAX) : 0
  if (selectedCount === 0) return null

  function reset() {
    setMode('idle')
    setField('status')
    setValue('')
    setError(null)
    setNotifyProgress(null)
  }

  function openNotifyConfirm() {
    setResult(null)
    setError(null)
    setNoticeDraft(notifyPreset)
    setMode(mode === 'notify-confirm' ? 'idle' : 'notify-confirm')
  }

  async function runUpdate(patch) {
    setBusy(true)
    setError(null)
    try {
      const { updated, failed } = await onBulkUpdate(selectedIds, patch)
      setResult({ updatedCount: updated.length, failedCount: failed.length })
      setMode('idle')
      setValue('')
    } catch (err) {
      setError(err.message || t('admin.sections.athletes.bulk.error'))
    } finally {
      setBusy(false)
    }
  }

  function applyNotifyOutcome(outcome) {
    setResult({
      notified: true,
      sent: outcome?.sent?.length ?? 0,
      skipped: outcome?.skipped?.length ?? 0,
      failed: outcome?.failed?.length ?? 0,
    })
  }

  async function runNotify() {
    if (!onNotifyIncomplete || notifyTargetCount === 0) return
    setBusy(true)
    setError(null)
    try {
      const outcome = await onNotifyIncomplete(notifyIds, noticeDraft.trim(), {
        onProgress: setNotifyProgress,
      })
      applyNotifyOutcome(outcome)
      setMode('idle')
      setNotifyProgress(null)
    } catch (err) {
      if (err.partial?.sent?.length) {
        applyNotifyOutcome(err.partial)
      }
      setError(
        err.partial?.sent?.length
          ? t('admin.sections.athletes.bulk.notifyPartialError', {
              sent: err.partial.sent.length,
            })
          : err.message || t('admin.sections.athletes.bulk.notifyError'),
      )
    } finally {
      setBusy(false)
      setNotifyProgress(null)
    }
  }

  function handleApply() {
    if (!value) return
    runUpdate({ [field]: value })
  }

  return (
    <div
      className="admin-athletes-bulk"
      role="region"
      aria-label={t('admin.sections.athletes.bulk.label')}
    >
      <div className="admin-athletes-bulk__row">
        <p
          className="admin-athletes-bulk__count"
          aria-label={t('admin.sections.athletes.bulk.selectedCount', { count: selectedCount })}
        >
          <strong>{selectedCount}</strong>
          <span>{t('admin.sections.athletes.bulk.selectedLabel')}</span>
        </p>

        {result ? (
          <span className="admin-athletes-bulk__result">
            {result.notified
              ? result.failed > 0
                ? t('admin.sections.athletes.bulk.notifyResultWithFailed', {
                    sent: result.sent,
                    skipped: result.skipped,
                    failed: result.failed,
                  })
                : t('admin.sections.athletes.bulk.notifyResult', {
                    sent: result.sent,
                    skipped: result.skipped,
                  })
              : result.failedCount > 0
                ? t('admin.sections.athletes.bulk.partialResult', {
                    updated: result.updatedCount,
                    total: result.updatedCount + result.failedCount,
                  })
                : t('admin.sections.athletes.bulk.fullResult', { count: result.updatedCount })}
          </span>
        ) : null}

        <div className="admin-athletes-bulk__actions">
          <button
            type="button"
            className={`admin-athletes-bulk__ghost${mode === 'edit' ? ' is-active' : ''}`}
            disabled={busy}
            aria-pressed={mode === 'edit'}
            onClick={() => {
              setResult(null)
              setMode(mode === 'edit' ? 'idle' : 'edit')
            }}
          >
            <Pencil size={13} aria-hidden />
            {t('admin.sections.athletes.bulk.editAction')}
          </button>
          <button
            type="button"
            className={`admin-athletes-bulk__ghost${mode === 'block-confirm' ? ' is-active' : ''}`}
            disabled={busy}
            aria-pressed={mode === 'block-confirm'}
            onClick={() => {
              setResult(null)
              setMode(mode === 'block-confirm' ? 'idle' : 'block-confirm')
            }}
          >
            <Lock size={13} aria-hidden />
            {t('admin.sections.athletes.bulk.blockAction')}
          </button>
          {onNotifyIncomplete ? (
            <button
              type="button"
              className={`admin-athletes-bulk__gold${mode === 'notify-confirm' ? ' is-active' : ''}`}
              disabled={busy}
              aria-pressed={mode === 'notify-confirm'}
              aria-label={t('admin.sections.athletes.bulk.notifyActionHint')}
              onClick={openNotifyConfirm}
            >
              <Bell size={13} aria-hidden />
              {t('admin.sections.athletes.bulk.notifyAction')}
            </button>
          ) : null}
        </div>

        <button
          type="button"
          className="admin-athletes-bulk__dismiss"
          onClick={() => {
            reset()
            setResult(null)
            onClearSelection()
          }}
          aria-label={t('admin.sections.athletes.bulk.clearSelection')}
        >
          <X size={15} aria-hidden />
        </button>
      </div>

      {mode === 'edit' ? (
        <div className="admin-athletes-bulk__panel">
          <label className="admin-athletes-bulk__field">
            <span>{t('admin.sections.athletes.bulk.fieldLabel')}</span>
            <select
              value={field}
              onChange={(event) => {
                setField(event.target.value)
                setValue('')
              }}
              disabled={busy}
            >
              <option value="status">{t('admin.sections.athletes.bulk.fieldStatus')}</option>
              <option value="gym">{t('admin.sections.athletes.bulk.fieldGym')}</option>
            </select>
          </label>

          <label className="admin-athletes-bulk__field admin-athletes-bulk__field--grow">
            <span>{t('admin.sections.athletes.bulk.valueLabel')}</span>
            {field === 'status' ? (
              <select value={value} onChange={(event) => setValue(event.target.value)} disabled={busy}>
                <option value="">{t('admin.sections.athletes.bulk.valuePlaceholder')}</option>
                {statusFieldOptions.map(([optionValue, optionLabel]) => (
                  <option key={optionValue} value={optionValue}>
                    {optionLabel}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={t('admin.sections.athletes.bulk.gymPlaceholder')}
                disabled={busy}
              />
            )}
          </label>

          <Button type="button" disabled={busy || !value} onClick={handleApply}>
            {busy
              ? t('admin.sections.athletes.bulk.applying')
              : t('admin.sections.athletes.bulk.apply', { count: selectedCount })}
          </Button>
          <button type="button" className="admin-athletes-bulk__text-btn" disabled={busy} onClick={reset}>
            {t('admin.sections.athletes.bulk.cancel')}
          </button>
        </div>
      ) : null}

      {mode === 'block-confirm' ? (
        <div className="admin-athletes-bulk__panel admin-athletes-bulk__panel--confirm">
          <p>
            <strong>
              {t('admin.sections.athletes.bulk.blockConfirmTitle', { count: selectedCount })}
            </strong>{' '}
            {t('admin.sections.athletes.bulk.blockConfirmBody')}
          </p>
          <Button
            type="button"
            className="admin-athletes-bulk__block-confirm"
            disabled={busy}
            onClick={() => runUpdate({ status: 'bloqueado' })}
          >
            {busy
              ? t('admin.sections.athletes.bulk.blocking')
              : t('admin.sections.athletes.bulk.blockConfirm')}
          </Button>
          <button type="button" className="admin-athletes-bulk__text-btn" disabled={busy} onClick={reset}>
            {t('admin.sections.athletes.bulk.cancel')}
          </button>
        </div>
      ) : null}

      {mode === 'notify-confirm' ? (
        <div className="admin-athletes-bulk__panel admin-athletes-bulk__panel--confirm admin-athletes-bulk__panel--notify">
          <div className="admin-athletes-bulk__notify-copy">
            <p>
              <strong>
                {t('admin.sections.athletes.bulk.notifyConfirmTitle', { count: selectedCount })}
              </strong>{' '}
              {t('admin.sections.athletes.bulk.notifyConfirmBody')}
            </p>
            <p className="admin-athletes-bulk__notify-meta">
              {t('admin.sections.athletes.bulk.notifyIncompleteCount', {
                count: notifyTargetCount,
              })}
              {completeSelectedCount > 0
                ? ` ${t('admin.sections.athletes.bulk.notifyCompleteSkipped', {
                    count: completeSelectedCount,
                  })}`
                : null}
              {notifyBatches > 1
                ? ` ${t('admin.sections.athletes.bulk.notifyBatches', {
                    batches: notifyBatches,
                    max: PROFILE_NOTICE_BULK_MAX,
                  })}`
                : null}
            </p>
            <label className="admin-athletes-bulk__note" htmlFor="admin-athletes-bulk-notice">
              <span>{t('admin.sections.athletes.bulk.notifyNoteLabel')}</span>
              <textarea
                id="admin-athletes-bulk-notice"
                value={noticeDraft}
                maxLength={PROFILE_NOTICE_MESSAGE_MAX}
                rows={3}
                disabled={busy}
                onChange={(event) => setNoticeDraft(event.target.value)}
                placeholder={t('admin.athleteDetail.profileNotice.notePlaceholder')}
              />
              <span className="admin-athletes-bulk__note-count">
                {noticeDraft.length}/{PROFILE_NOTICE_MESSAGE_MAX}
              </span>
            </label>
          </div>

          <aside className="admin-athletes-bulk__preview" aria-label={t('admin.sections.athletes.bulk.notifyPreviewLabel')}>
            <p className="admin-athletes-bulk__preview-eyebrow">{t('nav.notices')}</p>
            <p className="admin-athletes-bulk__preview-title">{t('account.profileNotice.title')}</p>
            <p className="admin-athletes-bulk__preview-lead">
              {t('account.profileNotice.lead', {
                fields: notifyMissingFields || '—',
              })}
            </p>
            {noticeDraft.trim() ? (
              <p className="admin-athletes-bulk__preview-message">{noticeDraft.trim()}</p>
            ) : null}
            <span className="admin-athletes-bulk__preview-action">{t('account.profileNotice.action')}</span>
          </aside>

          <div className="admin-athletes-bulk__notify-actions">
            <Button
              type="button"
              className="admin-athletes-bulk__notify-submit"
              disabled={busy || notifyTargetCount === 0}
              onClick={runNotify}
            >
              <Bell size={14} aria-hidden />
              {busy
                ? notifyProgress
                  ? t('admin.sections.athletes.bulk.notifyProgress', notifyProgress)
                  : t('admin.sections.athletes.bulk.notifying')
                : t('admin.sections.athletes.bulk.notify')}
            </Button>
            <button type="button" className="admin-athletes-bulk__text-btn" disabled={busy} onClick={reset}>
              {t('admin.sections.athletes.bulk.cancel')}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="admin-athletes-bulk__error">{error}</p> : null}
    </div>
  )
}
