import { useState } from 'react'
import { Lock, Pencil, X } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * Toolbar contextual de acciones en bloque para AthletesSection — aparece
 * cuando hay filas seleccionadas. Dos acciones reales hoy: editar
 * Estado/Gimnasio en lote, o bloquear (atajo de la misma edición con
 * status: 'bloqueado'). No hay borrado en bloque: el único borrado de
 * atleta sigue siendo el hard-delete de a uno, desde la ficha.
 */
export default function AdminAthletesBulkBar({
  selectedIds = [],
  statusFieldOptions = [],
  onBulkUpdate,
  onClearSelection,
}) {
  const { t } = useI18n()
  const [mode, setMode] = useState('idle') // idle | edit | block-confirm
  const [field, setField] = useState('status')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const selectedCount = selectedIds.length
  if (selectedCount === 0) return null

  function reset() {
    setMode('idle')
    setField('status')
    setValue('')
    setError(null)
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
        <span className="admin-athletes-bulk__count">
          {t('admin.sections.athletes.bulk.selectedCount', { count: selectedCount })}
        </span>

        {result ? (
          <span className="admin-athletes-bulk__result">
            {result.failedCount > 0
              ? t('admin.sections.athletes.bulk.partialResult', {
                  updated: result.updatedCount,
                  total: result.updatedCount + result.failedCount,
                })
              : t('admin.sections.athletes.bulk.fullResult', { count: result.updatedCount })}
          </span>
        ) : null}

        <div className="admin-athletes-bulk__actions">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setResult(null)
              setMode(mode === 'edit' ? 'idle' : 'edit')
            }}
          >
            <Pencil size={14} aria-hidden />
            {t('admin.sections.athletes.bulk.editAction')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setResult(null)
              setMode(mode === 'block-confirm' ? 'idle' : 'block-confirm')
            }}
          >
            <Lock size={14} aria-hidden />
            {t('admin.sections.athletes.bulk.blockAction')}
          </Button>
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

      {error ? <p className="admin-athletes-bulk__error">{error}</p> : null}
    </div>
  )
}
