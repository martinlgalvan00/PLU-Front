import { CheckCircle2, ScanLine } from 'lucide-react'
import AdminCheckinScanHistory from '../../components/admin/AdminCheckinScanHistory.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import AdminOfflineSyncStatus from '../../components/admin/AdminOfflineSyncStatus.jsx'
import AdminQrScanner from '../../components/admin/AdminQrScanner.jsx'
import CheckInScanResult from '../../components/admin/CheckInScanResult.jsx'
import PaymentValidationAction from '../../components/admin/PaymentValidationAction.jsx'
import { AdminIdentityCell, AdminTableActions } from '../../components/admin/AdminTableCells.jsx'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useCheckInWorkspace } from '../../hooks/useCheckInWorkspace.js'
import { formatDocumentWithKind } from '../../lib/format.js'

/** Etiqueta del día en el que compite una fila, según la grilla asignada. */
function dayLabel(dayIndexes, eventDays, t) {
  if (dayIndexes === 'all' || !Array.isArray(dayIndexes) || dayIndexes.length === 0) {
    return t('admin.checkin.bothDays')
  }
  return dayIndexes
    .map(
      (dayIndex) =>
        eventDays.find((day) => day.dayIndex === dayIndex)?.label ??
        t('admin.checkin.dayNumber', { day: dayIndex + 1 }),
    )
    .join(' · ')
}

/**
 * Puerta del evento. Además del ingreso resuelve el cobro que lo traba: una
 * inscripción con orden manual abierta (efectivo en sede o transferencia con
 * comprobante) se valida en la misma fila, con el comprobante a la vista, y
 * recién entonces habilita el ingreso.
 *
 * `canValidatePayments` lo decide `admin.payments.approve`, igual que en
 * Finanzas: la puerta no gana permisos por estar acá.
 */
export default function CheckInSection({
  athletes,
  canCheckIn,
  canValidatePayments = false,
  eventDays = [],
  eventSlug = 'pitbull-classic-2026',
  eventTitle = null,
  memberships = [],
  onApprovePayment,
  onCheckInRegistration,
  onCheckInTicket,
  onRedeemTicketAddon,
  onRefreshTickets,
  onRejectPayment,
  payments = [],
  registrations,
  ticketTypes = [],
  tickets,
}) {
  const { locale, t } = useI18n()
  const workspace = useCheckInWorkspace({
    athletes,
    canCheckIn,
    eventDays,
    eventSlug,
    onCheckInRegistration,
    onCheckInTicket,
    onRedeemTicketAddon,
    onRefreshTickets,
    payments,
    registrations,
    ticketTypes,
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
                {t('admin.eventEditor.ticketAddonReport.redeemed')}:{' '}
                {workspace.addonReport.redeemed}
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
      subtitle={
        eventTitle
          ? t('admin.sections.checkin.subtitleForEvent', { event: eventTitle })
          : t('admin.sections.checkin.subtitle')
      }
      stats={[
        {
          label: t('admin.checkin.statReady'),
          value: workspace.statusCounts.ready,
          tone: 'success',
        },
        { label: t('admin.checkin.statDone'), value: workspace.statusCounts.done, tone: 'default' },
        {
          label: t('admin.checkin.statPending'),
          value: workspace.statusCounts.pending,
          tone: 'warning',
        },
        // Solo cuando hay algo que cobrar: un cero permanente compite con los
        // tres contadores que sí describen el estado de la puerta.
        ...(workspace.statusCounts.toValidate > 0
          ? [
              {
                label: t('admin.checkin.statToValidate'),
                value: workspace.statusCounts.toValidate,
                tone: 'warning',
              },
            ]
          : []),
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
        getRowClassName={(row) =>
          row.id === workspace.highlightRowId ? 'data-table__row--selected' : ''
        }
        columns={[
          {
            key: 'name',
            label: t('admin.columns.attendee'),
            mobile: 'primary',
            render: (row) => (
              <AdminIdentityCell
                name={row.name}
                sub={formatDocumentWithKind(row.document)}
                subMono
              />
            ),
          },
          {
            key: 'type',
            label: t('admin.checkin.type'),
            mobile: 'default',
            render: (row) =>
              row.type === 'atleta' ? t('admin.checkin.athlete') : t('admin.checkin.spectator'),
          },
          { key: 'meta', label: t('admin.columns.category'), mobile: 'default' },
          {
            key: 'day',
            label: t('admin.checkin.dayLabel'),
            mobile: 'default',
            // `buildCheckinRows` arma `dayIndexes` ('all' o una lista): esta
            // celda leía un `row.day` que nunca existió y devolvía "Día 2"
            // para todo el roster.
            render: (row) => dayLabel(row.dayIndexes, eventDays, t),
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
                  time: new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(new Date(row.checkedInAt)),
                })

                return (
                  <span className="admin-checkin__done" title={timeLabel}>
                    <CheckCircle2 size={15} aria-hidden />
                    <span className="admin-checkin__done-time">
                      {new Intl.DateTimeFormat(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(row.checkedInAt))}
                    </span>
                  </span>
                )
              }

              return (
                <AdminTableActions>
                  {/* Va antes del ingreso porque es su condición: mientras la
                      orden esté abierta el botón de ingreso no se habilita. */}
                  {canValidatePayments && row.pendingOrder ? (
                    <PaymentValidationAction
                      athlete={{ fullName: row.name, documentId: row.document }}
                      detail={row.meta || undefined}
                      label={t('admin.checkin.settleAtDoor')}
                      onApprove={onApprovePayment}
                      onReject={onRejectPayment}
                      order={row.pendingOrder}
                    />
                  ) : null}
                  <AdminIconButton
                    disabled={!canCheckIn || row.status !== 'pagada'}
                    icon={ScanLine}
                    label={t('admin.checkin.markEntry')}
                    onClick={() => workspace.handleCheckIn(row)}
                    variant={row.pendingOrder ? 'ghost' : 'celeste'}
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
