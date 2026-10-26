import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  TriangleAlert,
  Upload,
} from 'lucide-react'
import Button from '../ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatModalities } from '../../../shared/registrationSelection.js'
import { REGISTRATION_IMPORT_MAX_ROWS } from '../../../shared/registrationSheet.js'
import {
  applyRegistrationImport,
  previewRegistrationImport,
  readRegistrationSheetFile,
} from '../../services/registrationSheetService.js'
import { useAdminModal } from './useAdminModal.js'
import '../../styles/pages/admin-sheet-import.css'

// Filas visibles por lista antes de "y N más": la vista previa es para
// revisar, no para listar 2000 filas en un modal.
const LIST_LIMIT = 60

function formatValue(field, value, locale) {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return '—'
  if (field === 'modalities') return formatModalities(value)
  if (field === 'bodyweightKg') {
    return `${Number(value).toLocaleString(locale === 'en' ? 'en-US' : 'es-AR')} kg`
  }
  if (field === 'declaredWeightClass') return `${value} kg`
  return String(value)
}

/**
 * Importación de la planilla de inscripciones (.xlsx): elegir archivo, ver
 * qué cambiaría fila por fila y aplicar solo lo válido. La comparación y la
 * validación las hace el servidor (`/admin/registrations/import`); acá solo
 * se lee el archivo y se muestra el resultado.
 */
export default function RegistrationSheetImportDialog({
  eventSlug = null,
  eventLabel = '',
  onClose,
  onApplied,
  // Inyectables para stories y tests; por defecto, el servicio real.
  readFile = readRegistrationSheetFile,
  previewRows = previewRegistrationImport,
  applyRows = applyRegistrationImport,
}) {
  const { t, locale } = useI18n()
  const text = (key, vars) => t(`admin.registrationSheet.${key}`, vars)
  const titleId = useId()
  const descriptionId = useId()
  const inputId = useId()
  const inputRef = useRef(null)
  const [phase, setPhase] = useState('pick')
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [fileError, setFileError] = useState('')
  const [progress, setProgress] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const busy = phase === 'reading' || phase === 'checking' || phase === 'applying'

  const close = () => {
    if (busy) return
    if (result?.summary.applied) onApplied?.()
    onClose()
  }
  const panelRef = useAdminModal(close)

  function reset() {
    setPhase('pick')
    setFileName('')
    setFileError('')
    setParsed(null)
    setPreview(null)
    setResult(null)
    setProgress(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleFile(file) {
    if (!file) return
    setFileName(file.name)
    setFileError('')
    if (!/\.xlsx$/i.test(file.name)) {
      setFileError(text('fileErrors.NOT_XLSX'))
      return
    }
    setPhase('reading')
    const sheet = await readFile(file)
    if (!sheet.ok) {
      setPhase('pick')
      setFileError(text(`fileErrors.${sheet.error}`, { max: REGISTRATION_IMPORT_MAX_ROWS }))
      return
    }
    setParsed(sheet)
    setPhase('checking')
    setProgress({ done: 0, total: sheet.rows.length })
    try {
      const response = sheet.rows.length
        ? await previewRows(sheet.rows, {
            eventSlug,
            onProgress: (done, total) => setProgress({ done, total }),
          })
        : { summary: { changed: 0, unchanged: 0, invalid: 0 }, rows: [] }
      setPreview(response)
      setPhase('review')
    } catch (error) {
      setPhase('pick')
      setFileError(text('fileErrors.REQUEST', { message: error?.message ?? '' }))
    } finally {
      setProgress(null)
    }
  }

  async function apply() {
    const changedRows = new Set(
      preview.rows.filter((row) => row.state === 'changed').map((row) => row.registrationId),
    )
    const rows = parsed.rows.filter((row) => changedRows.has(row.registrationId))
    setPhase('applying')
    setProgress({ done: 0, total: rows.length })
    try {
      const response = await applyRows(rows, {
        eventSlug,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      setResult(response)
      setPhase('done')
    } catch (error) {
      setPhase('review')
      setFileError(text('fileErrors.REQUEST', { message: error?.message ?? '' }))
    } finally {
      setProgress(null)
    }
  }

  const changed = preview?.rows.filter((row) => row.state === 'changed') ?? []
  // Errores del archivo (ID ilegible, celda que no se pudo leer) y del
  // servidor (regla de negocio), en una sola lista por número de fila.
  const problems = [
    ...(parsed?.issues ?? []).map((issue) => ({
      row: issue.row,
      athlete: '',
      registrationId: '',
      errors: [issue],
    })),
    ...(preview?.rows.filter((row) => row.state === 'invalid') ?? []),
  ].sort((left, right) => left.row - right.row)
  const unchangedCount = preview?.summary.unchanged ?? 0

  const athleteLabel = (row) =>
    row.athlete ||
    (row.registrationId ? text('unknownAthlete', { id: row.registrationId.slice(0, 8) }) : '—')
  const errorLabel = (error) =>
    text(`errors.${error.code}`, { value: error.value ?? '' }) || error.code

  const title = eventLabel ? text('titleEvent', { event: eventLabel }) : text('title')

  return createPortal(
    <div className="admin-status-dialog admin-sheet-import">
      <button
        type="button"
        className="admin-status-dialog__backdrop"
        aria-label={text('close')}
        disabled={busy}
        onClick={close}
      />
      <section
        ref={panelRef}
        className="admin-status-dialog__panel admin-sheet-import__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy}
      >
        <header className="admin-status-dialog__head">
          <span className="admin-status-dialog__icon" aria-hidden>
            <FileSpreadsheet size={18} />
          </span>
          <div>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId} className="admin-status-dialog__lead">
              {text('lead')}
            </p>
          </div>
        </header>

        {phase === 'pick' ? (
          <div className="admin-sheet-import__pick">
            <label
              htmlFor={inputId}
              className={`admin-sheet-import__drop${dragging ? ' is-dragging' : ''}`}
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                void handleFile(event.dataTransfer.files?.[0])
              }}
            >
              <Upload size={20} aria-hidden />
              <span className="admin-sheet-import__drop-cta">{text('pick')}</span>
              <span className="admin-sheet-import__drop-hint">{fileName || text('pickHint')}</span>
            </label>
            <input
              ref={inputRef}
              id={inputId}
              className="admin-sheet-import__input"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
            <p className="admin-status-dialog__hint">{text('pickNote')}</p>
          </div>
        ) : null}

        {busy ? (
          <p className="admin-sheet-import__progress" role="status">
            <LoaderCircle size={16} aria-hidden className="is-spinning" />
            {phase === 'reading'
              ? text('reading')
              : text(phase === 'applying' ? 'applying' : 'checking', {
                  done: progress?.done ?? 0,
                  total: progress?.total ?? 0,
                })}
          </p>
        ) : null}

        {phase === 'review' ? (
          <div className="admin-sheet-import__review">
            <p className="admin-sheet-import__file">
              <FileSpreadsheet size={14} aria-hidden />
              {fileName}
            </p>
            <ul className="admin-sheet-import__summary" aria-label={title}>
              <li className="is-changed">{text('summaryChanged', { count: changed.length })}</li>
              <li>{text('summaryUnchanged', { count: unchangedCount })}</li>
              <li className={problems.length ? 'is-invalid' : undefined}>
                {text('summaryInvalid', { count: problems.length })}
              </li>
            </ul>
            {parsed?.unknownColumns?.length ? (
              <p className="admin-status-dialog__hint">
                {text('ignoredColumns', { columns: parsed.unknownColumns.join(', ') })}
              </p>
            ) : null}

            {changed.length ? (
              <section
                className="admin-sheet-import__section"
                aria-labelledby={`${titleId}-changes`}
              >
                <h3 id={`${titleId}-changes`}>
                  {text('changesTitle')} <span>{changed.length}</span>
                </h3>
                <div className="admin-sheet-import__table-wrap">
                  <table className="admin-sheet-import__table">
                    <thead>
                      <tr>
                        <th scope="col">{text('colRow')}</th>
                        <th scope="col">{text('colAthlete')}</th>
                        <th scope="col">{text('colChange')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changed.slice(0, LIST_LIMIT).map((row) => (
                        <tr key={row.registrationId}>
                          <td className="admin-sheet-import__row-num">{row.row}</td>
                          <th scope="row">
                            <span>{athleteLabel(row)}</span>
                            {row.event && !eventSlug ? <small>{row.event}</small> : null}
                          </th>
                          <td>
                            <ul className="admin-sheet-import__changes">
                              {row.changes.map((change) => (
                                <li key={change.field}>
                                  <span className="admin-sheet-import__field">
                                    {text(`fields.${change.field}`)}
                                  </span>
                                  <span className="admin-sheet-import__from">
                                    {formatValue(change.field, change.from, locale)}
                                  </span>
                                  <ArrowRight size={12} aria-hidden />
                                  <span className="admin-sheet-import__sr">→</span>
                                  <span className="admin-sheet-import__to">
                                    {formatValue(change.field, change.to, locale)}
                                  </span>
                                </li>
                              ))}
                              {row.warnings?.map((warning) => (
                                <li key={warning.code} className="admin-sheet-import__warning">
                                  <TriangleAlert size={12} aria-hidden />
                                  {text(`warnings.${warning.code}`)}
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {changed.length > LIST_LIMIT ? (
                  <p className="admin-status-dialog__hint">
                    {text('more', { count: changed.length - LIST_LIMIT })}
                  </p>
                ) : null}
              </section>
            ) : (
              <p className="admin-sheet-import__empty">{text('noChanges')}</p>
            )}

            {problems.length ? (
              <section
                className="admin-sheet-import__section admin-sheet-import__section--errors"
                aria-labelledby={`${titleId}-errors`}
              >
                <h3 id={`${titleId}-errors`}>
                  {text('errorsTitle')} <span>{problems.length}</span>
                </h3>
                <ul className="admin-sheet-import__problems">
                  {problems.slice(0, LIST_LIMIT).map((row) => (
                    <li key={`${row.row}-${row.registrationId}`}>
                      <span className="admin-sheet-import__row-num">
                        {text('rowLabel', { row: row.row })}
                      </span>
                      <span className="admin-sheet-import__problem-body">
                        {row.athlete ? <strong>{row.athlete}</strong> : null}
                        {row.errors.map((error) => (
                          <span key={`${error.field}-${error.code}`}>
                            {text(`fields.${error.field}`)}: {errorLabel(error)}
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
                {problems.length > LIST_LIMIT ? (
                  <p className="admin-status-dialog__hint">
                    {text('more', { count: problems.length - LIST_LIMIT })}
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : null}

        {phase === 'done' && result ? (
          <div className="admin-sheet-import__done" role="status">
            <CheckCircle2 size={22} aria-hidden />
            <div>
              <strong>
                {text(result.summary.applied === 1 ? 'doneTitle_one' : 'doneTitle_other', {
                  count: result.summary.applied,
                })}
              </strong>
              <p>{text('doneLead')}</p>
              {result.summary.failed ? (
                <>
                  <p className="admin-sheet-import__failed">
                    {text('doneFailed', { count: result.summary.failed })}
                  </p>
                  <ul className="admin-sheet-import__problems">
                    {result.rows
                      .filter((row) => row.state === 'failed' || row.state === 'invalid')
                      .slice(0, LIST_LIMIT)
                      .map((row) => (
                        <li key={row.registrationId}>
                          <span className="admin-sheet-import__row-num">
                            {text('rowLabel', { row: row.row })}
                          </span>
                          <span className="admin-sheet-import__problem-body">
                            <strong>{athleteLabel(row)}</strong>
                            <span>
                              {row.message ??
                                row.errors?.map((error) => errorLabel(error)).join(' ')}
                            </span>
                          </span>
                        </li>
                      ))}
                  </ul>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {fileError ? (
          <p className="admin-status-dialog__error" role="alert">
            {fileError}
          </p>
        ) : null}

        <div className="admin-status-dialog__actions">
          {phase === 'done' ? (
            <Button type="button" onClick={close}>
              {text('done')}
            </Button>
          ) : (
            <>
              {phase === 'review' ? (
                <Button type="button" variant="secondary" onClick={reset}>
                  {text('another')}
                </Button>
              ) : (
                <Button type="button" variant="secondary" disabled={busy} onClick={close}>
                  {text('cancel')}
                </Button>
              )}
              {phase === 'review' || phase === 'applying' ? (
                <Button type="button" disabled={busy || changed.length === 0} onClick={apply}>
                  {phase === 'applying' ? (
                    <LoaderCircle size={15} aria-hidden className="is-spinning" />
                  ) : null}
                  {text(changed.length === 1 ? 'apply_one' : 'apply_other', {
                    count: changed.length,
                  })}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>,
    document.body,
  )
}
