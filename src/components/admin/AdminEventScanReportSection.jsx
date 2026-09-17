import { useEffect, useState } from 'react'
import { AlertTriangle, ScanSearch, ShieldAlert } from 'lucide-react'
import AdminApiConnectionNotice from './AdminApiConnectionNotice.jsx'
import AdminDataTable from './AdminDataTable.jsx'
import AdminEmptyState from './AdminEmptyState.jsx'
import AnalyticsStatTile from './AnalyticsStatTile.jsx'
import Pill from '../ui/Pill.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * Mismo criterio de tono que `SCAN_VERDICT_META` en useCheckInWorkspace.js,
 * pero acá es sólo el nombre del tono (no íconos): este panel resume
 * intentos ya pasados, no reacciona a un escaneo en vivo.
 */
const OUTCOME_TONE = Object.freeze({
  checked_in: 'success',
  ready: 'success',
  already_used: 'warning',
  not_ready: 'warning',
  no_registration: 'warning',
  wrong_zone: 'warning',
  not_yet_valid: 'warning',
  not_found: 'danger',
  invalid: 'danger',
  expired: 'danger',
})

function outcomeLabel(t, outcome) {
  const key = `admin.checkin.scanner.outcome.${outcome}`
  const label = t(key)
  return label === key ? outcome : label
}

export default function AdminEventScanReportSection({ eventSlug, onGetReport }) {
  const { t, locale } = useI18n()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    if (!eventSlug || !onGetReport) return undefined

    setLoading(true)
    setError(null)
    onGetReport(eventSlug)
      .then((data) => {
        if (active) setReport(data)
      })
      .catch((err) => {
        if (active) setError(err)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [eventSlug, onGetReport, reloadKey])

  const dateTimeFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  })

  const summary = report?.summary ?? null
  const hasActivity = Boolean(summary?.total)

  return (
    <section
      className="admin-event-security admin-event-scan-report"
      aria-labelledby="admin-event-scan-report-title"
    >
      <header className="admin-event-security__head">
        <div className="admin-event-security__head-copy">
          <h3 id="admin-event-scan-report-title">
            {t('admin.eventEditor.security.scanReport.title')}
          </h3>
          <p className="admin-event-security__lead">
            {t('admin.eventEditor.security.scanReport.lead')}
          </p>
        </div>
      </header>

      {error && (
        <AdminApiConnectionNotice
          error={error}
          retrying={loading}
          onRetry={() => setReloadKey((current) => current + 1)}
        />
      )}

      {loading ? (
        <p className="admin-event-security__empty">
          {t('admin.eventEditor.security.scanReport.loading')}
        </p>
      ) : !error && !hasActivity ? (
        <AdminEmptyState
          icon={ScanSearch}
          title={t('admin.eventEditor.security.scanReport.emptyTitle')}
          lead={t('admin.eventEditor.security.scanReport.empty')}
        />
      ) : !error ? (
        <>
          <div className="admin-event-scan-report__stats">
            <AnalyticsStatTile
              label={t('admin.eventEditor.security.scanReport.statTotal')}
              value={summary.total}
              tone="default"
            />
            <AnalyticsStatTile
              label={t('admin.eventEditor.security.scanReport.statAdmitted')}
              value={summary.admitted}
              tone="celeste"
            />
            <AnalyticsStatTile
              label={t('admin.eventEditor.security.scanReport.statRejected')}
              value={summary.rejected}
              tone={summary.rejected > 0 ? 'alert' : 'default'}
              icon={summary.rejected > 0 ? AlertTriangle : undefined}
            />
          </div>

          {summary.byOutcome?.length ? (
            <ul className="admin-event-scan-report__outcomes">
              {summary.byOutcome
                .filter((entry) => entry.outcome !== 'checked_in' && entry.outcome !== 'ready')
                .map((entry) => (
                  <li key={entry.outcome}>
                    <Pill tone={OUTCOME_TONE[entry.outcome] ?? 'neutral'}>
                      {outcomeLabel(t, entry.outcome)} · {entry.count}
                    </Pill>
                  </li>
                ))}
            </ul>
          ) : null}

          {report.repeated?.length ? (
            <div className="admin-event-scan-report__repeated">
              <h4>
                <ShieldAlert size={13} aria-hidden />
                {t('admin.eventEditor.security.scanReport.repeatedTitle')}
              </h4>
              <ul>
                {report.repeated.map((item) => (
                  <li key={item.qrFingerprint}>
                    <span className="admin-event-scan-report__repeated-credential">
                      {item.credentialLabel || item.ticketCode || t('admin.eventEditor.security.scanReport.repeatedUnknown')}
                    </span>
                    <span className="admin-event-scan-report__repeated-detail">
                      {t('admin.eventEditor.security.scanReport.repeatedAttempts', {
                        count: item.attempts,
                      })}
                      {item.gates?.length
                        ? ` · ${item.gates.join(', ')}`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <AdminDataTable
            className="admin-event-scan-report__table"
            emptyMessage={t('admin.eventEditor.security.scanReport.recentEmpty')}
            columns={[
              {
                key: 'scannedAt',
                label: t('admin.eventEditor.security.scanReport.columnWhen'),
                mobile: 'primary',
                render: (row) => dateTimeFormatter.format(new Date(row.scannedAt)),
              },
              {
                key: 'outcome',
                label: t('admin.eventEditor.security.scanReport.columnOutcome'),
                mobile: 'badge',
                render: (row) => (
                  <Pill tone={OUTCOME_TONE[row.outcome] ?? 'neutral'}>
                    {outcomeLabel(t, row.outcome)}
                  </Pill>
                ),
              },
              {
                key: 'credential',
                label: t('admin.eventEditor.security.scanReport.columnCredential'),
                mobile: 'default',
                render: (row) => row.credentialLabel || row.ticketTypeName || row.ticketCode || '—',
              },
              {
                key: 'gate',
                label: t('admin.eventEditor.security.scanReport.columnGate'),
                mobile: 'default',
                render: (row) => row.gate || '—',
              },
              {
                key: 'evidence',
                label: t('admin.eventEditor.security.scanReport.columnEvidence'),
                mobile: 'default',
                render: (row) => (
                  <Pill tone={row.evidence === 'server' ? 'info' : 'neutral'}>
                    {t(`admin.eventEditor.security.scanReport.evidence.${row.evidence}`)}
                  </Pill>
                ),
              },
            ]}
            rows={(report.recent ?? []).map((row) => ({ ...row }))}
          />
        </>
      ) : null}
    </section>
  )
}
