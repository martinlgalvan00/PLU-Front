import { useMemo, useState } from 'react'
import { CheckCircle2, LogOut, ScanLine, Users } from 'lucide-react'
import AdminCheckinScanHistory from '../components/admin/AdminCheckinScanHistory.jsx'
import AdminIconButton from '../components/admin/AdminIconButton.jsx'
import AdminOfflineSyncStatus from '../components/admin/AdminOfflineSyncStatus.jsx'
import AdminQrScanner from '../components/admin/AdminQrScanner.jsx'
import CheckInScanResult from '../components/admin/CheckInScanResult.jsx'
import { AdminIdentityCell, AdminTableActions } from '../components/admin/AdminTableCells.jsx'
import BrandLogo from '../components/ui/BrandLogo.jsx'
import DataTable, { StatusBadge } from '../components/ui/DataTable.jsx'
import LanguageToggle from '../components/ui/LanguageToggle.jsx'
import ThemeToggle from '../components/ui/ThemeToggle.jsx'
import { useCheckInWorkspace } from '../hooks/useCheckInWorkspace.js'
import { useI18n } from '../i18n/I18nProvider.jsx'

export default function CheckInAppPage({
  athletes,
  canCheckIn,
  eventSlug = 'pitbull-classic-2026',
  onCheckInRegistration,
  onCheckInTicket,
  onExit,
  onRedeemTicketAddon,
  onRefreshTickets,
  registrations,
  roleLabel,
  tickets,
}) {
  const { locale, t } = useI18n()
  const [tab, setTab] = useState('scan')
  const [historyOpen, setHistoryOpen] = useState(false)
  const workspace = useCheckInWorkspace({
    athletes,
    canCheckIn,
    eventSlug,
    onCheckInRegistration,
    onCheckInTicket,
    onRedeemTicketAddon,
    onRefreshTickets,
    registrations,
    tickets,
  })

  const eventLabel = useMemo(() => eventSlug.replace(/-/g, ' '), [eventSlug])

  return (
    <div className="checkin-app">
      <header className="checkin-app__top">
        <div className="checkin-app__brand">
          <BrandLogo variant="argentina" height={28} />
          <div className="checkin-app__brand-copy">
            <strong>{t('admin.checkinApp.title')}</strong>
            <span>{roleLabel} · {eventLabel}</span>
          </div>
        </div>
        <div className="checkin-app__top-actions">
          <LanguageToggle />
          <ThemeToggle />
          <button type="button" className="checkin-app__exit" onClick={onExit}>
            <LogOut size={16} aria-hidden />
            <span>{t('admin.checkinApp.exit')}</span>
          </button>
        </div>
      </header>

      <nav className="checkin-app__tabs" aria-label={t('admin.checkinApp.title')}>
        <button
          type="button"
          className={`checkin-app__tab${tab === 'scan' ? ' is-active' : ''}`}
          onClick={() => setTab('scan')}
        >
          <ScanLine size={16} aria-hidden />
          {t('admin.checkinApp.scanTab')}
        </button>
        <button
          type="button"
          className={`checkin-app__tab${tab === 'list' ? ' is-active' : ''}`}
          onClick={() => setTab('list')}
        >
          <Users size={16} aria-hidden />
          {t('admin.checkinApp.listTab')}
          <span className="checkin-app__tab-count">{workspace.statusCounts.ready}</span>
        </button>
      </nav>

      <main className="checkin-app__main">
        {tab === 'scan' ? (
          <div className="checkin-app__scan">
            <AdminOfflineSyncStatus
              conflictCount={workspace.offlineSync.conflictCount}
              downloadAllowlist={workspace.offlineSync.downloadAllowlist}
              isOnline={workspace.offlineSync.isOnline}
              lastDownloadedAt={workspace.offlineSync.lastDownloadedAt}
              lastSyncedAt={workspace.offlineSync.lastSyncedAt}
              pendingCount={workspace.offlineSync.pendingCount}
              syncNow={workspace.offlineSync.syncNow}
              syncing={workspace.offlineSync.syncing}
            />

            <AdminQrScanner
              busy={workspace.scanBusy}
              disabled={!canCheckIn}
              feedbackPrefs={workspace.feedbackPrefs}
              onFeedbackPrefsChange={workspace.persistFeedbackPrefs}
              onScan={workspace.handleScan}
            />

            <CheckInScanResult
              canCheckIn={canCheckIn}
              locale={locale}
              onDismiss={() => workspace.setScanResult(null)}
              onRedeemAddon={workspace.handleRedeemAddon}
              onScanCheckIn={workspace.handleScanCheckIn}
              redeemBusyId={workspace.redeemBusyId}
              redeemError={workspace.redeemError}
              scanBusy={workspace.scanBusy}
              scanPersonDoc={workspace.scanPersonDoc}
              scanPersonName={workspace.scanPersonName}
              scanResult={workspace.scanResult}
              scanTicketPaid={workspace.scanTicketPaid}
              scanVerdict={workspace.scanVerdict}
            />

            <details
              className="checkin-app__collapse"
              open={historyOpen}
              onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
            >
              <summary>{t('admin.checkinApp.historyToggle')}</summary>
              <AdminCheckinScanHistory
                items={workspace.scanHistory.map((item) => ({
                  ...item,
                  active: item.id === workspace.activeHistoryId,
                }))}
                onClear={() => {
                  workspace.setScanHistory([])
                  workspace.setActiveHistoryId(null)
                }}
                onSelect={workspace.handleHistorySelect}
              />
            </details>
          </div>
        ) : (
          <div className="checkin-app__list">
            <div className="checkin-app__list-stats" aria-label={t('admin.summary.aria')}>
              <span>{workspace.statusCounts.ready} {t('admin.checkin.statReady')}</span>
              <span>{workspace.statusCounts.done} {t('admin.checkin.statDone')}</span>
              <span>{workspace.statusCounts.pending} {t('admin.checkin.statPending')}</span>
            </div>

            <label className="checkin-app__search">
              <input
                type="search"
                value={workspace.query}
                placeholder={t('admin.checkin.searchPlaceholder')}
                aria-label={t('admin.checkin.searchPlaceholder')}
                onChange={(event) => workspace.setQuery(event.target.value)}
              />
            </label>

            <DataTable
              variant="admin"
              getRowClassName={(row) => (row.id === workspace.highlightRowId ? 'data-table__row--selected' : '')}
              columns={[
                {
                  key: 'name',
                  label: t('admin.columns.attendee'),
                  mobile: 'primary',
                  render: (row) => <AdminIdentityCell name={row.name} sub={row.document} />,
                },
                {
                  key: 'type',
                  label: t('admin.checkin.type'),
                  mobile: 'default',
                  render: (row) => (row.type === 'atleta' ? t('admin.checkin.athlete') : t('admin.checkin.spectator')),
                },
                { key: 'meta', label: t('admin.columns.category'), mobile: 'default' },
                {
                  key: 'status',
                  label: t('admin.columns.status'),
                  mobile: 'badge',
                  render: (row) => <StatusBadge value={row.status} />,
                },
                {
                  key: 'action',
                  label: t('admin.columns.action'),
                  mobile: 'action',
                  render: (row) => {
                    if (row.status === 'usada') {
                      return (
                        <span className="admin-checkin__done">
                          <CheckCircle2 size={15} aria-hidden />
                        </span>
                      )
                    }

                    return (
                      <AdminTableActions>
                        <AdminIconButton
                          disabled={!canCheckIn || row.status !== 'pagada'}
                          icon={ScanLine}
                          label={t('admin.checkin.markEntry')}
                          onClick={() => workspace.handleCheckIn(row)}
                          variant="celeste"
                        />
                      </AdminTableActions>
                    )
                  },
                },
              ]}
              rows={workspace.rows}
              emptyMessage={t('admin.checkin.empty')}
            />
          </div>
        )}
      </main>
    </div>
  )
}
