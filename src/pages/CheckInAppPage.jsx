import { useCallback, useEffect, useMemo, useState } from 'react'
import '../styles/pages/admin.css'
import '../styles/pages/checkin-app.css'
import {
  CalendarDays,
  CheckCircle2,
  LogOut,
  ScanLine,
  Search,
  ShieldCheck,
  TicketCheck,
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
import { loadAdminMessagesForStoredLocale } from '../i18n/adminMessages.js'
import { formatDocumentWithKind } from '../lib/format.js'
import { downloadCheckinListExcel } from '../services/checkinExport.js'
import { checkinTypeLabel } from '../services/checkinScanService.js'
import {
  formatCheckinRowDay,
  summarizeTicketControl,
} from '../services/checkinWorkspaceService.js'
import { useI18n } from '../i18n/I18nProvider.jsx'

function CheckinMetric({ label, tone = 'neutral', value }) {
  return (
    <div className={`checkin-app__metric checkin-app__metric--${tone}`}>
      <strong>{value}</strong>
      <small>{label}</small>
    </div>
  )
}

const DAY_TAB_PREFIX = 'day-'

function DoorClip({ children }) {
  const text = children == null || children === '' ? '—' : String(children)
  return (
    <span className="checkin-app__clip" title={text}>
      {text}
    </span>
  )
}

export default function CheckInAppPage({
  athletes,
  canCheckIn,
  eventDays = [],
  eventSlug = 'pitbull-classic-2026',
  eventTitle,
  onCheckInRegistration,
  onCheckInTicket,
  onExit,
  onRedeemTicketAddon,
  onRefreshTickets,
  registrations,
  roleLabel,
  /** Puesto asignado a la cuenta: nombre y alcance. Nulo = sin zona. */
  securityZone = null,
  ticketTypes = [],
  tickets,
}) {
  const { locale, t, messages } = useI18n()
  const adminReady = Boolean(messages?.admin?.checkinApp?.exit)
  const [tab, setTab] = useState('scan')

  // La ruta de la puerta ya espera estos textos. Si esta pantalla se monta
  // igual sin ellos, se piden una vez y no se pinta ninguna clave.
  useEffect(() => {
    if (adminReady) return
    loadAdminMessagesForStoredLocale().catch(() => {})
  }, [adminReady])

  const [listScannerOpen, setListScannerOpen] = useState(false)
  const workspace = useCheckInWorkspace({
    athletes,
    canCheckIn,
    eventDays,
    eventSlug,
    onCheckInRegistration,
    onCheckInTicket,
    onRedeemTicketAddon,
    onRefreshTickets,
    registrations,
    securityZone,
    ticketTypes,
    tickets,
  })
  const { setDay, setType, setCheckinStatus, setCredential } = workspace

  useEffect(() => {
    if (tab === 'scan' || !workspace.highlightRowId) return
    document
      .querySelector('.checkin-app__list .data-table__row--selected')
      ?.scrollIntoView({ block: 'nearest' })
  }, [tab, workspace.highlightRowId])

  const eventLabel = useMemo(
    () =>
      eventTitle || eventSlug.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
    [eventSlug, eventTitle],
  )

  const tabs = useMemo(
    () => [
      { id: 'scan', Icon: ScanLine, label: t('admin.checkinApp.scanTab') },
      ...eventDays.map((eventDay) => ({
        id: `${DAY_TAB_PREFIX}${eventDay.dayIndex}`,
        Icon: CalendarDays,
        label: eventDay.label,
        count: workspace.statusCounts.byDay?.[eventDay.dayIndex],
      })),
      {
        id: 'tickets',
        Icon: TicketCheck,
        label: t('admin.checkinApp.ticketsTab'),
        count: workspace.statusCounts.spectators,
      },
    ],
    [eventDays, t, workspace.statusCounts.byDay, workspace.statusCounts.spectators],
  )

  useEffect(() => {
    setCredential('all')
    if (tab.startsWith(DAY_TAB_PREFIX)) {
      setType('all')
      setDay(Number(tab.slice(DAY_TAB_PREFIX.length)))
      setCheckinStatus('all')
    } else if (tab === 'tickets') {
      setType('espectador')
      setDay('all')
      setCheckinStatus('all')
    }
  }, [setCheckinStatus, setCredential, setDay, setType, tab])

  const ticketControl = useMemo(
    () => summarizeTicketControl(workspace.allRows),
    [workspace.allRows],
  )

  const activeDayLabel = tab.startsWith(DAY_TAB_PREFIX)
    ? tabs.find((item) => item.id === tab)?.label
    : null
  const listTitle =
    tab === 'tickets'
      ? t('admin.checkinApp.ticketsTitle')
      : t('admin.checkinApp.dayTitle', { day: activeDayLabel ?? '' })

  function handleTabChange(event, nextTab) {
    setTab(nextTab)
    event.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }

  const handleDownloadAllowlist = useCallback(async () => {
    await workspace.offlineSync.downloadAllowlist()
    downloadCheckinListExcel({
      rows: workspace.allRows,
      eventDays,
      eventSlug,
      t,
    })
  }, [eventDays, eventSlug, t, workspace.allRows, workspace.offlineSync])

  const queueIsWork =
    !workspace.offlineSync.isOnline || workspace.offlineSync.pendingCount > 0

  const offlineStatus = (
    <AdminOfflineSyncStatus
      compact
      conflictCount={workspace.offlineSync.conflictCount}
      downloadAllowlist={handleDownloadAllowlist}
      failedCount={workspace.offlineSync.failedCount}
      isOnline={workspace.offlineSync.isOnline}
      lastDownloadedAt={workspace.offlineSync.lastDownloadedAt}
      lastSyncedAt={workspace.offlineSync.lastSyncedAt}
      onReloadAndSync={workspace.reloadAndSync}
      pendingCount={workspace.offlineSync.pendingCount}
      queueLog={workspace.offlineSync.queueLog}
      syncIssue={workspace.offlineSync.syncIssue}
      syncNow={workspace.offlineSync.syncNow}
      syncing={workspace.offlineSync.syncing}
      workList={queueIsWork}
    />
  )

  const scanResultPanel = (
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
  )

  if (!adminReady) {
    return (
      <div className="checkin-app checkin-app--pending" role="status">
        {locale === 'en' ? 'Loading gate…' : 'Cargando puesto…'}
      </div>
    )
  }

  return (
    <div className={`checkin-app${tab === 'scan' ? ' checkin-app--scan' : ''}`}>
      <header className="checkin-app__top">
        <div className="checkin-app__brand">
          <BrandLogo variant="argentina" height={28} />
          <div className="checkin-app__brand-copy">
            <span className="checkin-app__eyebrow">
              <ShieldCheck size={12} aria-hidden />
              {t('admin.checkinApp.operation')}
            </span>
            <strong>{eventLabel}</strong>
            {/* El puesto reemplaza al rol cuando la cuenta tiene uno: para
                quien está en la puerta, "Calentamiento" dice mucho más que
                "Seguridad" -- es el sector al que está habilitado y lo que
                decide qué credenciales le van a abrir. */}
            <span>{securityZone?.name ?? roleLabel}</span>
          </div>
        </div>
        <div className="checkin-app__top-actions">
          <LanguageToggle compact />
          <ThemeToggle compact />
          <button
            type="button"
            className="checkin-app__exit"
            aria-label={t('admin.checkinApp.exit')}
            onClick={onExit}
          >
            <LogOut size={16} aria-hidden />
            <span>{t('admin.checkinApp.exit')}</span>
          </button>
        </div>
      </header>

      <div className="checkin-app__ops">
        <section className="checkin-app__overview" aria-label={t('admin.summary.aria')}>
          <span className="checkin-app__live-dot" aria-hidden />
          <div className="checkin-app__metrics">
            <CheckinMetric
              label={t('admin.checkinApp.totalPeople')}
              value={workspace.statusCounts.total}
            />
            <CheckinMetric
              label={t('admin.checkin.statReady')}
              tone="success"
              value={workspace.statusCounts.ready}
            />
            <CheckinMetric
              label={t('admin.checkin.statDone')}
              tone="brand"
              value={workspace.statusCounts.done}
            />
            <CheckinMetric
              label={t('admin.checkin.statPending')}
              tone="warning"
              value={workspace.statusCounts.pending}
            />
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
      </div>

      <main className="checkin-app__main">
        {tab === 'scan' ? (
          <div className="checkin-app__scan-layout">
            <section className="checkin-app__scan-primary">
              <h1 className="visually-hidden">{t('admin.checkinApp.title')}</h1>
              {/* Qué abre este puesto, dicho antes de escanear y no después de
                  un rechazo. El alcance es la MISMA regla que aplica el canje
                  en el servidor, así que esto no es una etiqueta decorativa:
                  es lo que va a pasar cuando pase un QR. */}
              {securityZone ? (
                <p
                  className="checkin-app__zone-notice"
                  title={`${securityZone.name}. ${t(`admin.eventZones.scopeHint.${securityZone.scope}`)}`}
                >
                  <ShieldCheck size={14} aria-hidden />
                  <span>
                    <strong>{securityZone.name}</strong>
                    {t(`admin.eventZones.scopeHint.${securityZone.scope}`)}
                  </span>
                </p>
              ) : null}

              {queueIsWork ? offlineStatus : null}

              <AdminQrScanner
                busy={workspace.scanBusy}
                compact
                disabled={!canCheckIn}
                feedbackPrefs={workspace.feedbackPrefs}
                onFeedbackPrefsChange={workspace.persistFeedbackPrefs}
                onScan={workspace.handleScan}
              />

              {scanResultPanel}
            </section>

            <aside className="checkin-app__scan-aside">
              {queueIsWork ? null : offlineStatus}

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
            <div className="checkin-app__scan-bar">
              {offlineStatus}
              <button
                type="button"
                className="btn btn--small checkin-app__scan-toggle"
                aria-expanded={listScannerOpen}
                onClick={() => setListScannerOpen((open) => !open)}
              >
                <ScanLine size={15} aria-hidden />
                {listScannerOpen
                  ? t('admin.checkinApp.hideScanOnList')
                  : t('admin.checkinApp.scanOnList')}
              </button>
              {listScannerOpen ? (
                <AdminQrScanner
                  busy={workspace.scanBusy}
                  compact
                  disabled={!canCheckIn}
                  feedbackPrefs={workspace.feedbackPrefs}
                  onFeedbackPrefsChange={workspace.persistFeedbackPrefs}
                  onScan={workspace.handleScan}
                />
              ) : null}
              {workspace.scanResult ? scanResultPanel : null}
            </div>
            {tab === 'tickets' ? (
              <div className="checkin-app__ticket-control" role="group" aria-label={listTitle}>
                {[
                  ['ready', 'ready', ticketControl.ready, 'admin.checkinApp.ticketReady'],
                  ['done', 'inside', ticketControl.inside, 'admin.checkinApp.ticketInside'],
                  ['unpaid', 'unpaid', ticketControl.unpaid, 'admin.checkinApp.ticketUnpaid'],
                  ['blocked', 'blocked', ticketControl.blocked, 'admin.checkinApp.ticketBlocked'],
                ].map(([status, tone, value, labelKey]) => (
                  <button
                    key={status}
                    type="button"
                    className={`checkin-app__metric checkin-app__metric--${tone}${
                      workspace.checkinStatus === status ? ' is-active' : ''
                    }`}
                    aria-pressed={workspace.checkinStatus === status}
                    onClick={() =>
                      workspace.setCheckinStatus(workspace.checkinStatus === status ? 'all' : status)
                    }
                  >
                    <strong>{value}</strong>
                    <small>{t(labelKey)}</small>
                  </button>
                ))}
              </div>
            ) : null}

            <header className="checkin-app__list-head">
              <div>
                <h1 id="checkin-list-title">{listTitle}</h1>
                <p>
                  {tab === 'tickets'
                    ? t('admin.checkinApp.ticketsLead')
                    : t('admin.checkinApp.listLead')}
                </p>
              </div>
              <span className="checkin-app__result-count">
                {t(
                  workspace.rows.length === 1
                    ? 'admin.checkinApp.visiblePerson'
                    : 'admin.checkinApp.visiblePeople',
                  { count: workspace.rows.length },
                )}
              </span>
            </header>

            <div className="checkin-app__list-toolbar">
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
              <div className="checkin-app__filters">
                {tab === 'tickets' ? (
                  workspace.credentialOptions.length > 0 ? (
                    <AdminFilterChipGroup
                      compact
                      id="checkin-credential"
                      label={t('admin.checkin.credentialFilter')}
                      value={workspace.credential}
                      onChange={workspace.setCredential}
                      options={workspace.credentialOptions}
                      omitNeutral
                      allLabel={t('admin.checkin.filterAllCredentials')}
                      clearable
                      hideEmpty
                    />
                  ) : null
                ) : (
                  <AdminFilterChipGroup
                    compact
                    id="checkin-type"
                    label={t('admin.checkin.type')}
                    value={workspace.type}
                    onChange={workspace.setType}
                    options={workspace.typeOptions}
                    omitNeutral
                    allLabel={t('admin.filters.showingAll')}
                    clearable
                    hideEmpty
                  />
                )}
                <AdminFilterChipGroup
                  compact
                  id="checkin-status"
                  label={t('admin.checkin.statusLabelShort')}
                  value={workspace.checkinStatus}
                  onChange={workspace.setCheckinStatus}
                  options={workspace.statusOptions}
                  omitNeutral
                  allLabel={t('admin.filters.showingAll')}
                  clearable
                  hideEmpty
                />
              </div>
            </div>

            <AdminDataTable
              ariaLabel={listTitle}
              layout="table"
              pageResetKey={[
                tab,
                workspace.query,
                workspace.type,
                workspace.day,
                workspace.checkinStatus,
                workspace.credential,
              ].join('|')}
              getRowClassName={(row) =>
                row.id === workspace.highlightRowId ? 'data-table__row--selected' : ''
              }
              columns={[
                {
                  key: 'name',
                  label: t('admin.columns.attendee'),
                  mobile: 'primary',
                  fixed: 'left',
                  width: 200,
                  render: (row) => (
                    <AdminIdentityCell
                      name={row.name}
                      sub={[formatDocumentWithKind(row.document), row.ticketCode]
                        .filter(Boolean)
                        .join(' · ')}
                      subMono
                    />
                  ),
                },
                {
                  key: 'type',
                  label: t('admin.checkin.type'),
                  className: 'data-table__column--clip',
                  mobile: 'hidden',
                  width: 120,
                  render: (row) => <DoorClip>{checkinTypeLabel(row, t)}</DoorClip>,
                },
                {
                  key: 'meta',
                  label: t('admin.columns.category'),
                  className: 'data-table__column--clip',
                  mobile: 'hidden',
                  width: 180,
                  render: (row) => <DoorClip>{row.meta}</DoorClip>,
                },
                {
                  key: 'day',
                  label: t('admin.checkin.dayLabel'),
                  className: 'data-table__column--clip',
                  mobile: tab === 'tickets' ? 'default' : 'hidden',
                  width: 140,
                  render: (row) => <DoorClip>{formatCheckinRowDay(row, eventDays, t)}</DoorClip>,
                },
                {
                  key: 'status',
                  label: t('admin.columns.status'),
                  mobile: 'badge',
                  mobileLabel: '',
                  width: 108,
                  render: (row) => <StatusBadge value={row.status} />,
                },
                {
                  key: 'action',
                  label: t('admin.columns.action'),
                  mobile: 'action',
                  fixed: 'right',
                  width: 132,
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
                        disabled={!workspace.canAdmitRow(row)}
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
