import { CheckCircle2, ScanLine } from 'lucide-react'
import AdminCheckinScanHistory from '../../components/admin/AdminCheckinScanHistory.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import AdminOfflineSyncStatus from '../../components/admin/AdminOfflineSyncStatus.jsx'
import AdminQrScanner from '../../components/admin/AdminQrScanner.jsx'
import CheckInScanResult from '../../components/admin/CheckInScanResult.jsx'
import { AdminIdentityCell, AdminTableActions } from '../../components/admin/AdminTableCells.jsx'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useCheckInWorkspace } from '../../hooks/useCheckInWorkspace.js'
import { formatDocumentWithKind } from '../../lib/format.js'

export default function CheckInSection({
  athletes,
  canCheckIn,
  eventSlug = 'pitbull-classic-2026',
  memberships = [],
  onCheckInRegistration,
  onCheckInTicket,
  onRedeemTicketAddon,
  onRefreshTickets,
  registrations,
  tickets,
}) {
  const { locale, t } = useI18n()
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

  void memberships

  return (
    <AdminListSection
      variant="checkin"
      beforeFilters={
        <>
          {workspace.addonReport.hasActivity && workspace.addonReport.pending > 0 ? (
            <div className="admin-checkin-addon-summary" role="status">
              <strong>{t('admin.eventEditor.ticketAddonReport.title')}</strong>
              <span>
                {t('admin.eventEditor.ticketAddonReport.pending')}: {workspace.addonReport.pending}
              </span>
              <span>
                {t('admin.eventEditor.ticketAddonReport.redeemed')}: {workspace.addonReport.redeemed}
              </span>
            </div>
          ) : null}

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
        </>
      }
      filteredCount={workspace.rows.length}
      placeholder={t('admin.checkin.searchPlaceholder')}
      query={workspace.query}
      showHeader
      showStats
      eyebrow={t('admin.sections.checkin.eyebrow')}
      title={t('admin.sections.checkin.title')}
      subtitle={t('admin.sections.checkin.subtitle')}
      stats={[
        { label: t('admin.checkin.statReady'), value: workspace.statusCounts.ready, tone: 'success' },
        { label: t('admin.checkin.statDone'), value: workspace.statusCounts.done, tone: 'default' },
        { label: t('admin.checkin.statPending'), value: workspace.statusCounts.pending, tone: 'warning' },
      ]}
      totalCount={workspace.allRows.length}
      filters={[
        {
          id: 'type',
          label: t('admin.checkin.type'),
          value: workspace.type,
          onChange: workspace.setType,
          options: workspace.typeOptions,
        },
        {
          id: 'day',
          label: t('admin.checkin.dayLabel'),
          value: workspace.day,
          onChange: workspace.setDay,
          options: workspace.dayOptions,
        },
        {
          id: 'checkinStatus',
          label: t('admin.checkin.statusLabelShort'),
          value: workspace.checkinStatus,
          onChange: workspace.setCheckinStatus,
          options: workspace.statusOptions,
        },
      ]}
      onQueryChange={workspace.setQuery}
    >
      <AdminDataTable
        variant="admin"
        getRowClassName={(row) => (row.id === workspace.highlightRowId ? 'data-table__row--selected' : '')}
        columns={[
          {
            key: 'name',
            label: t('admin.columns.attendee'),
            mobile: 'primary',
            render: (row) => <AdminIdentityCell name={row.name} sub={formatDocumentWithKind(row.document)} subMono />,
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
            render: (row) => {
              if (row.status === 'usada') {
                const timeLabel = t('admin.checkin.checkedInAt', {
                  time: new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(
                    new Date(row.checkedInAt),
                  ),
                })

                return (
                  <span className="admin-checkin__done" title={timeLabel}>
                    <CheckCircle2 size={15} aria-hidden />
                    <span className="admin-checkin__done-time">
                      {new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
                        new Date(row.checkedInAt),
                      )}
                    </span>
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
    </AdminListSection>
  )
}
