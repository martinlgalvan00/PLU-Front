import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getEventResults, importEventResults } from '../../services/meetResultsService.js'

function formatKg(value) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  const number = Number(value)
  return Number.isInteger(number) ? `${number} kg` : `${number.toFixed(1)} kg`
}

function formatScore(value) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return Number(value).toFixed(1)
}

export default function AdminEventResults({ event, canWrite = false }) {
  const { t } = useI18n()
  const fileRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(false)
  const [payload, setPayload] = useState(null)
  const [csv, setCsv] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setPreview(false)
    setCsv('')
    getEventResults(event.slug)
      .then((result) => {
        if (!cancelled) setPayload(result)
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError?.message || t('admin.eventResults.loadFailed'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [event.slug, t])

  async function readFile(file) {
    const text = await file.text()
    setCsv(text)
    setBusy(true)
    setError('')
    try {
      const result = await importEventResults(event.slug, { csv: text, apply: false })
      setPayload(result)
      setPreview(true)
    } catch (importError) {
      setError(importError?.message || t('admin.eventResults.importFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function confirmImport() {
    if (!csv) return
    setBusy(true)
    setError('')
    try {
      const result = await importEventResults(event.slug, { csv, apply: true })
      setPayload(result)
      setPreview(false)
      setCsv('')
    } catch (importError) {
      setError(importError?.message || t('admin.eventResults.importFailed'))
    } finally {
      setBusy(false)
    }
  }

  const rows = payload?.awards?.sheet ?? []
  const awards = payload?.awards
  const errors = payload?.errors ?? []
  const empty = !loading && !error && rows.length === 0 && !preview

  return (
    <section className="admin-event-results" aria-labelledby="admin-event-results-title">
      <header className="admin-event-results__head">
        <div>
          <h2 id="admin-event-results-title">{t('admin.eventResults.title')}</h2>
          <p>{t('admin.eventResults.lead')}</p>
        </div>
        {canWrite ? (
          <div className="admin-event-results__import">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(change) => {
                const file = change.target.files?.[0]
                change.target.value = ''
                if (file) void readFile(file)
              }}
            />
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? t('admin.eventResults.reading') : t('admin.eventResults.chooseFile')}
            </button>
            {preview ? (
              <button
              type="button"
              className="is-primary"
              disabled={busy || rows.length === 0}
              onClick={() => void confirmImport()}
            >
              {t('admin.eventResults.replace')}
            </button>
            ) : null}
          </div>
        ) : null}
      </header>

      {error ? (
        <p className="admin-event-results__error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? <p className="admin-event-results__note">{t('admin.eventResults.loading')}</p> : null}

      {empty ? <p className="admin-event-results__note">{t('admin.eventResults.empty')}</p> : null}
      {preview ? <p className="admin-event-results__note">{t('admin.eventResults.preview')}</p> : null}
      {!preview && payload?.imported > 0 ? (
        <p className="admin-event-results__note">
          {t('admin.eventResults.saved', { count: payload.imported })}
        </p>
      ) : null}

      {!loading && rows.length > 0 && awards ? (
        <div className="admin-event-results__awards">
          <article>
            <h3>{t('admin.eventResults.bestLifter')}</h3>
            {awards.bestLifter ? (
              <>
                <strong>{awards.bestLifter.athleteName}</strong>
                <p>
                  {t('admin.eventResults.dots', { score: formatScore(awards.bestLifter.score) })}
                  {' · '}
                  {formatKg(awards.bestLifter.totalKg)}
                </p>
              </>
            ) : (
              <p>{t('admin.eventResults.noBestLifter')}</p>
            )}
            {awards.mastersMissingAge > 0 ? (
              <p className="admin-event-results__note">
                {t('admin.eventResults.mastersMissingAge', { count: awards.mastersMissingAge })}
              </p>
            ) : null}
          </article>
          <article>
            <h3>{t('admin.eventResults.bestTeam')}</h3>
            {awards.bestTeam ? (
              <>
                <strong>{awards.bestTeam.teamName}</strong>
                <p>
                  {t('admin.eventResults.teamScore', {
                    score: formatScore(awards.bestTeam.score),
                    count: awards.bestTeam.lifterCount,
                  })}
                </p>
              </>
            ) : (
              <p>
                {awards.bestTeamReason === 'no_team_data'
                  ? t('admin.eventResults.noTeamData')
                  : t('admin.eventResults.notEnoughTeams')}
              </p>
            )}
          </article>
        </div>
      ) : null}

      {errors.length ? (
        <ul className="admin-event-results__errors">
          {errors.slice(0, 8).map((item) => (
            <li key={`${item.row}-${item.message}`}>
              {t('admin.eventResults.rowError', { row: item.row, message: item.message })}
            </li>
          ))}
        </ul>
      ) : null}

      {rows.length ? (
        <div className="admin-event-results__sheet">
          <table>
            <thead>
              <tr>
                <th>{t('admin.eventResults.columns.place')}</th>
                <th>{t('admin.eventResults.columns.name')}</th>
                <th>{t('admin.eventResults.columns.total')}</th>
                <th>{t('admin.eventResults.columns.dots')}</th>
                <th>{t('admin.eventResults.columns.team')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.athleteName}-${row.place ?? 'x'}-${index}`}>
                  <td>{row.place ?? '—'}</td>
                  <td>{row.athleteName}</td>
                  <td>{formatKg(row.totalKg)}</td>
                  <td>{formatScore(row.dots)}</td>
                  <td>{row.teamName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
