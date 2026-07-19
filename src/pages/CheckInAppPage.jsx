import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  LogOut,
  ScanLine,
  Search,
  ShieldCheck,
  TicketCheck,
  Users,
} from 'lucide-react'
import AdminCheckinScanHistory from '../components/admin/AdminCheckinScanHistory.jsx'
import AdminDataTable, { StatusBadge } from '../components/admin/AdminDataTable.jsx'
import AdminFilterChipGroup from '../components/admin/AdminFilterChipGroup.jsx'
import AdminOfflineSyncStatus from '../components/admin/AdminOfflineSyncStatus.jsx'
import AdminQrScanner from '../components/admin/AdminQrScanner.jsx'
import CheckInScanResult from '../components/admin/CheckInScanResult.jsx'
import { AdminIdentityCell } from '../components/admin/AdminTableCells.jsx'
import BrandLogo from '../components/ui/BrandLogo.jsx'
import LanguageToggle from '../components/ui/LanguageToggle.jsx'
import ThemeToggle from '../components/ui/ThemeToggle.jsx'
import { useCheckInWorkspace } from '../hooks/useCheckInWorkspace.js'
import { useI18n } from '../i18n/I18nProvider.jsx'

function CheckinMetric({ icon: Icon, label, tone = 'neutral', value }) {
  return (
    <div className={`checkin-app__metric checkin-app__metric--${tone}`}>
      <Icon size={15} aria-hidden />
      <span>
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
    </div>
  )
}

export default function CheckInAppPage({
  athletes,
  canCheckIn,
  eventSlug = 'pitbull-classic-2026',
  eventTitle,
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
  const { setDay, setType } = workspace

  const eventLabel = useMemo(
    () => eventTitle || eventSlug.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
    [eventSlug, eventTitle],
  )

  const tabs = useMemo(
    () => [
      { id: 'scan', Icon: ScanLine, label: t('admin.checkinApp.scanTab') },
      { id: 'day1', Icon: CalendarDays, label: t('admin.checkin.day1'), count: workspace.statusCounts.day1 },
      { id: 'day2', Icon: CalendarDays, label: t('admin.checkin.day2'), count: workspace.statusCounts.day2 },
      {
        id: 'tickets',
        Icon: TicketCheck,
        label: t('admin.checkinApp.ticketsTab'),
        count: workspace.statusCounts.spectators,
      },
    ],
    [t, workspace.statusCounts.day1, workspace.statusCounts.day2, workspace.statusCounts.spectators],
  )

  useEffect(() => {
    if (tab === 'day1') {
      setType('all')
      setDay('day1')
    } else if (tab === 'day2') {
      setType('all')
      setDay('day2')
    } else if (tab === 'tickets') {
      setType('espectador')
      setDay('all')
    }
  }, [setDay, setType, tab])

  const listTitle =
    tab === 'tickets'
      ? t('admin.checkinApp.ticketsTitle')
      : t('admin.checkinApp.dayTitle', { day: tab === 'day2' ? t('admin.checkin.day2') : t('admin.checkin.day1') })

  function handleTabChange(event, nextTab) {
    setTab(nextTab)
    event.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }

  return (
    <div className="checkin-app">
      <header className="checkin-app__top">
        <div className="checkin-app__brand">
          <BrandLogo variant="argentina" height={28} />
          <div className="checkin-app__brand-copy">
            <span className="checkin-app__eyebrow">
              <ShieldCheck size={12} aria-hidden />
              {t('admin.checkinApp.operation')}
            </span>
            <strong>{eventLabel}</strong>
            <span>{roleLabel}</span>
          </div>
        </div>
        <div className="checkin-app__top-actions">
          <LanguageToggle compact />
          <ThemeToggle compact />
          <button type="button" className="checkin-app__exit" onClick={onExit}>
            <LogOut size={16} aria-hidden />
            <span>{t('admin.checkinApp.exit')}</span>
          </button>
        </div>
      </header>

      <section className="checkin-app__overview" aria-label={t('admin.summary.aria')}>
        <div className="checkin-app__overview-copy">
          <span className="checkin-app__live-dot" aria-hidden />
          <div>
            <strong>{t('admin.checkinApp.title')}</strong>
            <span>{t('admin.checkinApp.overviewLead')}</span>
          </div>
        </div>
        <div className="checkin-app__metrics">
          <CheckinMetric icon={Users} label={t('admin.checkinApp.totalPeople')} value={workspace.statusCounts.total} />
          <CheckinMetric icon={CheckCircle2} label={t('admin.checkin.statReady')} tone="success" value={workspace.statusCounts.ready} />
          <CheckinMetric icon={ShieldCheck} label={t('admin.checkin.statDone')} tone="brand" value={workspace.statusCounts.done} />
          <CheckinMetric icon={Clock3} label={t('admin.checkin.statPending')} tone="warning" value={workspace.statusCounts.pending} />
        </div>
      </section>

      <nav className="checkin-app__tabs" aria-label={t('admin.checkinApp.title')}>
        {tabs.map(({ id, Icon, label, count }) => (
          <button
            key={id}
            type="button"
            className={`checkin-app__tab${tab === id ? ' is-active' : ''}`}
            aria-current={tab === id ? 'page' : undefined}
            onClick={(event) => handleTabChange(event, id)}
          >
            <Icon size={15} aria-hidden />
            <span>{label}</span>
            {Number.isFinite(count) && <span className="checkin-app__tab-count">{count}</span>}
          </button>
        ))}
      </nav>

      <main className="checkin-app__main">
        {tab === 'scan' ? (
          <div className="checkin-app__scan-layout">
            <section className="checkin-app__scan-primary">
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
            </section>

            <aside className="checkin-app__scan-aside">
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
            </aside>
          </div>
        ) : (
          <section className="checkin-app__list" aria-labelledby="checkin-list-title">
            <header className="checkin-app__list-head">
              <div>
                <span className="checkin-app__list-eyebrow">{t('admin.checkinApp.allowlist')}</span>
                <h1 id="checkin-list-title">{listTitle}</h1>
                <p>{t('admin.checkinApp.listLead')}</p>
              </div>
              <span className="checkin-app__result-count">
                {t('admin.checkinApp.visiblePeople', { count: workspace.rows.length })}
              </span>
            </header>

            <div className="checkin-app__filters">
              <label className="checkin-app__search">
                <Search size={16} aria-hidden />
                <input
                  type="search"
                  value={workspace.query}
                  placeholder={t('admin.checkin.searchPlaceholder')}
                  aria-label={t('admin.checkin.searchPlaceholder')}
                  onChange={(event) => workspace.setQuery(event.target.value)}
                />
              </label>
              <AdminFilterChipGroup
                compact
                id="checkin-status"
                label={t('admin.checkin.statusLabelShort')}
                value={workspace.checkinStatus}
                onChange={workspace.setCheckinStatus}
                options={workspace.statusOptions}
              />
            </div>

            <AdminDataTable
              ariaLabel={listTitle}
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
                  key: 'day',
                  label: t('admin.checkin.dayLabel'),
                  mobile: 'default',
                  render: (row) =>
                    row.day === 'both'
                      ? t('admin.checkin.bothDays')
                      : row.day === 'day1'
                        ? t('admin.checkin.day1')
                        : t('admin.checkin.day2'),
                },
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
                  render: (row) =>
                    row.status === 'usada' ? (
                      <span className="checkin-app__admitted">
                        <CheckCircle2 size={14} aria-hidden />
                        {t('admin.checkinApp.admitted')}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="checkin-app__admit-btn"
                        disabled={!canCheckIn || row.status !== 'pagada'}
                        onClick={() => workspace.handleCheckIn(row)}
                      >
                        <ShieldCheck size={14} aria-hidden />
                        {t('admin.checkin.markEntry')}
                      </button>
                    ),
                },
              ]}
              rows={workspace.rows}
              emptyMessage={t('admin.checkin.empty')}
            />
          </section>
        )}
      </main>
    </div>
  )
}
