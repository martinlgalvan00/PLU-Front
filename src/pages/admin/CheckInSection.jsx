import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, HelpCircle, ScanLine, XCircle } from 'lucide-react'
import AdminCheckinScanHistory from '../../components/admin/AdminCheckinScanHistory.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import AdminQrScanner from '../../components/admin/AdminQrScanner.jsx'
import AdminTicketAddonRedemption from '../../components/admin/AdminTicketAddonRedemption.jsx'
import { AdminIdentityCell, AdminTableActions } from '../../components/admin/AdminTableCells.jsx'
import DataTable, { StatusBadge } from '../../components/ui/DataTable.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { buildEventTicketAddonReport } from '../../lib/ticketAddons.js'
import { parseCredentialScan } from '../../lib/credentialQr.js'
import { getFeedbackTone, playCheckinFeedback } from '../../lib/checkinFeedback.js'
import {
  buildTicketRow,
  registrationCheckinStatus,
  resolveCredentialScan,
} from '../../services/checkinScanService.js'

const MAX_SCAN_HISTORY = 15
const FEEDBACK_STORAGE_KEY = 'plu-checkin-feedback'

const TYPE_FILTERS = [
  ['all', 'admin.checkin.filterAllTypes'],
  ['atleta', 'admin.checkin.athlete'],
  ['espectador', 'admin.checkin.spectator'],
]

const DAY_FILTERS = [
  ['all', 'admin.checkin.filterAllDays'],
  ['day1', 'admin.checkin.day1'],
  ['day2', 'admin.checkin.day2'],
  ['both', 'admin.checkin.bothDays'],
]

const STATUS_FILTERS = [
  ['all', 'admin.checkin.filterAllStatuses'],
  ['ready', 'admin.checkin.filterReady'],
  ['done', 'admin.checkin.filterDone'],
  ['pending', 'admin.checkin.filterPending'],
]

const SCAN_VERDICT_META = {
  ready: { Icon: CheckCircle2, tone: 'success' },
  already_used: { Icon: AlertTriangle, tone: 'warning' },
  not_ready: { Icon: HelpCircle, tone: 'warning' },
  no_registration: { Icon: HelpCircle, tone: 'warning' },
  not_found: { Icon: XCircle, tone: 'danger' },
  invalid: { Icon: XCircle, tone: 'danger' },
}

function matchesCheckinStatus(row, filter) {
  if (filter === 'all') return true
  if (filter === 'done') return row.status === 'usada'
  if (filter === 'ready') return row.status === 'pagada'
  return row.status !== 'usada' && row.status !== 'pagada'
}

function buildRows(athletes, registrations, tickets) {
  const athleteRows = registrations
    .filter((registration) => registration.status !== 'cancelada')
    .map((registration) => {
      const athlete = athletes.find((item) => item.id === registration.athleteId)
      return {
        id: `reg-${registration.id}`,
        registrationId: registration.id,
        type: 'atleta',
        name: athlete?.fullName,
        document: athlete?.documentId,
        meta: [registration.category, registration.division].filter(Boolean).join(' · '),
        day: 'both',
        status: registrationCheckinStatus(registration),
        checkedInAt: registration.checkedInAt,
      }
    })

  const ticketRows = tickets.map((ticket) => ({
    id: `tkt-${ticket.id}`,
    ticketCode: ticket.ticketCode,
    qrToken: ticket.qrToken,
    type: 'espectador',
    name: ticket.attendeeName,
    document: ticket.attendeeDni,
    meta: ticket.ticketCode,
    day: ticket.dayPass,
    status: ticket.status,
    checkedInAt: ticket.checkedInAt,
    addons: ticket.addons ?? [],
  }))

  return [...athleteRows, ...ticketRows]
}

function readFeedbackPrefs() {
  if (typeof window === 'undefined') {
    return { soundEnabled: true, vibrateEnabled: true }
  }

  try {
    const stored = window.sessionStorage.getItem(FEEDBACK_STORAGE_KEY)
    if (!stored) return { soundEnabled: true, vibrateEnabled: true }
    return JSON.parse(stored)
  } catch {
    return { soundEnabled: true, vibrateEnabled: true }
  }
}

function buildHistoryEntry(resolved, raw) {
  const name = resolved.row?.name ?? resolved.athlete?.fullName ?? resolved.ticket?.attendeeName ?? null
  const document =
    resolved.row?.document ?? resolved.athlete?.documentId ?? resolved.ticket?.attendeeDni ?? null

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    scannedAt: new Date().toISOString(),
    outcome: resolved.outcome ?? 'invalid',
    tone: getFeedbackTone(resolved.outcome ?? 'invalid'),
    name,
    document,
    type: resolved.row?.type ?? (resolved.kind === 'registration' ? 'atleta' : resolved.kind === 'ticket' ? 'espectador' : null),
    rowId: resolved.row?.id ?? null,
    checkedIn: false,
    raw,
    snapshot: resolved,
  }
}

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
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [day, setDay] = useState('all')
  const [checkinStatus, setCheckinStatus] = useState('all')
  const [scanResult, setScanResult] = useState(null)
  const [scanBusy, setScanBusy] = useState(false)
  const [highlightRowId, setHighlightRowId] = useState(null)
  const [scanHistory, setScanHistory] = useState([])
  const [activeHistoryId, setActiveHistoryId] = useState(null)
  const [feedbackPrefs, setFeedbackPrefs] = useState(readFeedbackPrefs)
  const [redeemBusyId, setRedeemBusyId] = useState(null)
  const [redeemError, setRedeemError] = useState('')

  function persistFeedbackPrefs(next) {
    setFeedbackPrefs(next)
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(next))
    }
  }

  function prependHistoryEntry(entry) {
    setScanHistory((current) => [entry, ...current].slice(0, MAX_SCAN_HISTORY))
    setActiveHistoryId(entry.id)
  }

  function markHistoryCheckedIn(historyId) {
    setScanHistory((current) =>
      current.map((item) =>
        item.id === historyId
          ? { ...item, checkedIn: true, outcome: 'already_used', tone: getFeedbackTone('already_used') }
          : item,
      ),
    )
  }

  useEffect(() => {
    onRefreshTickets?.(eventSlug)
  }, [eventSlug, onRefreshTickets])

  const allRows = useMemo(
    () => buildRows(athletes, registrations, tickets),
    [athletes, registrations, tickets],
  )

  const statusCounts = useMemo(
    () => ({
      ready: allRows.filter((row) => row.status === 'pagada').length,
      done: allRows.filter((row) => row.status === 'usada').length,
      pending: allRows.filter((row) => row.status !== 'usada' && row.status !== 'pagada').length,
    }),
    [allRows],
  )

  const addonReport = useMemo(
    () => buildEventTicketAddonReport(tickets, eventSlug),
    [eventSlug, tickets],
  )

  const typeOptions = useMemo(() => TYPE_FILTERS.map(([value, key]) => [value, t(key)]), [t])
  const dayOptions = useMemo(() => DAY_FILTERS.map(([value, key]) => [value, t(key)]), [t])
  const statusOptions = useMemo(
    () =>
      STATUS_FILTERS.map(([value, key]) => {
        const count =
          value === 'all'
            ? allRows.length
            : value === 'ready'
              ? statusCounts.ready
              : value === 'done'
                ? statusCounts.done
                : statusCounts.pending
        return [value, `${t(key)} (${count})`]
      }),
    [allRows.length, statusCounts, t],
  )

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return allRows.filter((row) => {
      const typeMatch = type === 'all' || row.type === type
      const dayMatch = day === 'all' || row.day === day
      const statusMatch = matchesCheckinStatus(row, checkinStatus)
      const queryMatch =
        !normalizedQuery ||
        row.name?.toLowerCase().includes(normalizedQuery) ||
        row.document?.includes(normalizedQuery) ||
        row.meta?.toLowerCase().includes(normalizedQuery)
      return typeMatch && dayMatch && statusMatch && queryMatch
    })
  }, [allRows, query, type, day, checkinStatus])

  const handleScan = useCallback(
    async (raw) => {
      const parsed = parseCredentialScan(raw)
      if (!parsed?.code) {
        const invalidResult = { outcome: 'invalid' }
        setScanResult(invalidResult)
        prependHistoryEntry(buildHistoryEntry(invalidResult, raw))
        playCheckinFeedback('invalid', feedbackPrefs)
        return
      }

      setScanBusy(true)
      setScanResult(null)

      try {
        const resolved = await resolveCredentialScan(parsed, {
          athletes,
          memberships,
          registrations,
          defaultEventSlug: eventSlug,
        })
        const historyEntry = buildHistoryEntry(resolved, raw)
        setScanResult(resolved)
        setRedeemError('')
        prependHistoryEntry(historyEntry)
        playCheckinFeedback(resolved.outcome ?? 'invalid', feedbackPrefs)
        if (resolved.row?.id) {
          setHighlightRowId(resolved.row.id)
        }
      } catch (error) {
        console.error('checkin scan:', error)
        const notFoundResult = { outcome: 'not_found' }
        setScanResult(notFoundResult)
        prependHistoryEntry(buildHistoryEntry(notFoundResult, raw))
        playCheckinFeedback('not_found', feedbackPrefs)
      } finally {
        setScanBusy(false)
      }
    },
    [athletes, eventSlug, feedbackPrefs, memberships, registrations],
  )

  function handleHistorySelect(item) {
    setActiveHistoryId(item.id)
    if (item.snapshot) {
      setScanResult(item.snapshot)
      if (item.rowId) {
        setHighlightRowId(item.rowId)
      }
    }
  }

  async function handleCheckIn(row) {
    if (row.type === 'atleta') {
      const result = onCheckInRegistration(row.registrationId)
      if (result?.outcome === 'ok') {
        playCheckinFeedback('checkin_ok', feedbackPrefs)
        if (activeHistoryId) markHistoryCheckedIn(activeHistoryId)
        setScanResult((current) =>
          current?.row?.id === row.id
            ? { ...current, outcome: 'already_used', canCheckIn: false, status: 'usada' }
            : current,
        )
      }
      return
    }

    const result = await onCheckInTicket(row.qrToken)
    onRefreshTickets?.(eventSlug)

    if (result?.outcome === 'ok') {
      playCheckinFeedback('checkin_ok', feedbackPrefs)
      if (activeHistoryId) markHistoryCheckedIn(activeHistoryId)
      setScanResult((current) =>
        current?.row?.id === row.id
          ? { ...current, outcome: 'already_used', canCheckIn: false, status: 'usada' }
          : current,
      )
    }
  }

  async function handleScanCheckIn() {
    if (!scanResult?.canCheckIn || !canCheckIn) return

    if (scanResult.kind === 'ticket') {
      const result = await onCheckInTicket(scanResult.qrToken)
      onRefreshTickets?.(eventSlug)
      if (result?.outcome === 'ok' || result?.outcome === 'already_used') {
        playCheckinFeedback(result.outcome === 'ok' ? 'checkin_ok' : 'already_used', feedbackPrefs)
        if (activeHistoryId) markHistoryCheckedIn(activeHistoryId)
        const nextTicket = result.ticket ?? scanResult.ticket
        setScanResult({
          ...scanResult,
          outcome: 'already_used',
          canCheckIn: false,
          status: 'usada',
          ticket: nextTicket,
          row: nextTicket ? buildTicketRow(nextTicket) : scanResult.row,
        })
      }
      return
    }

    if (scanResult.kind === 'registration') {
      const result = onCheckInRegistration(scanResult.registrationId)
      if (result?.outcome === 'ok') {
        playCheckinFeedback('checkin_ok', feedbackPrefs)
        if (activeHistoryId) markHistoryCheckedIn(activeHistoryId)
        setScanResult({ ...scanResult, outcome: 'already_used', canCheckIn: false, status: 'usada' })
      }
    }
  }

  async function handleRedeemAddon(addonId) {
    if (!scanResult?.qrToken || !onRedeemTicketAddon) return
    setRedeemBusyId(addonId)
    setRedeemError('')
    try {
      const result = await onRedeemTicketAddon(scanResult.qrToken, addonId)
      if (result?.error) {
        setRedeemError(result.error)
        return
      }
      if (result?.ticket) {
        const nextTicket = result.ticket
        setScanResult((current) =>
          current?.kind === 'ticket' && current.qrToken === scanResult.qrToken
            ? {
                ...current,
                ticket: nextTicket,
                row: buildTicketRow(nextTicket),
              }
            : current,
        )
        onRefreshTickets?.(eventSlug)
        playCheckinFeedback('checkin_ok', feedbackPrefs)
      }
    } catch (error) {
      console.error('redeem addon:', error)
      setRedeemError(error.message ?? 'No se pudo canjear el beneficio.')
    } finally {
      setRedeemBusyId(null)
    }
  }

  const scanVerdict = scanResult ? SCAN_VERDICT_META[scanResult.outcome] ?? SCAN_VERDICT_META.invalid : null
  const ScanVerdictIcon = scanVerdict?.Icon
  const scanPersonName =
    scanResult?.row?.name ?? scanResult?.athlete?.fullName ?? scanResult?.ticket?.attendeeName
  const scanPersonDoc =
    scanResult?.row?.document ?? scanResult?.athlete?.documentId ?? scanResult?.ticket?.attendeeDni
  const scanTicketPaid =
    scanResult?.kind === 'ticket' &&
    (['pagada', 'usada'].includes(scanResult.ticket?.status) ||
      scanResult.status === 'usada' ||
      Boolean(scanResult.ticket?.checkedInAt))

  return (
    <AdminListSection
      variant="checkin"
      beforeFilters={
        <>
          {addonReport.hasActivity && addonReport.pending > 0 ? (
            <div className="admin-checkin-addon-summary" role="status">
              <strong>{t('admin.eventEditor.ticketAddonReport.title')}</strong>
              <span>
                {t('admin.eventEditor.ticketAddonReport.pending')}: {addonReport.pending}
              </span>
              <span>
                {t('admin.eventEditor.ticketAddonReport.redeemed')}: {addonReport.redeemed}
              </span>
            </div>
          ) : null}

          <AdminQrScanner
            busy={scanBusy}
            disabled={!canCheckIn}
            feedbackPrefs={feedbackPrefs}
            onFeedbackPrefsChange={persistFeedbackPrefs}
            onScan={handleScan}
          />

          {scanResult && scanVerdict && (
            <div
              className={`admin-checkin-result admin-checkin-result--${scanVerdict.tone}`}
              role="status"
              aria-live="polite"
            >
              <div className="admin-checkin-result__header">
                <ScanVerdictIcon size={22} aria-hidden />
                <div>
                  <strong>{t(`admin.checkin.scanner.outcome.${scanResult.outcome}`)}</strong>
                  {scanPersonName && (
                    <p className="admin-checkin-result__person">
                      {scanPersonName}
                      {scanPersonDoc ? ` · ${scanPersonDoc}` : ''}
                    </p>
                  )}
                </div>
              </div>

              {scanResult.row && (
                <dl className="admin-checkin-result__meta">
                  <div>
                    <dt>{t('admin.checkin.type')}</dt>
                    <dd>
                      {scanResult.row.type === 'atleta'
                        ? t('admin.checkin.athlete')
                        : t('admin.checkin.spectator')}
                    </dd>
                  </div>
                  {scanResult.status && (
                    <div>
                      <dt>{t('admin.columns.status')}</dt>
                      <dd>
                        <StatusBadge value={scanResult.status} />
                      </dd>
                    </div>
                  )}
                </dl>
              )}

              {scanResult.kind === 'ticket' && (scanResult.ticket?.addons?.length ?? 0) > 0 ? (
                <AdminTicketAddonRedemption
                  addons={scanResult.ticket.addons}
                  canRedeem={canCheckIn}
                  locale={locale}
                  onRedeem={handleRedeemAddon}
                  redeemBusyId={redeemBusyId}
                  redeemError={redeemError}
                  ticketPaid={scanTicketPaid}
                />
              ) : null}

              <div className="admin-checkin-result__actions">
                {scanResult.canCheckIn && (
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={!canCheckIn || scanBusy}
                    onClick={handleScanCheckIn}
                  >
                    <ScanLine size={15} aria-hidden />
                    {t('admin.checkin.markEntry')}
                  </button>
                )}
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setScanResult(null)}>
                  {t('admin.checkin.scanner.dismiss')}
                </button>
              </div>
            </div>
          )}

          <AdminCheckinScanHistory
            items={scanHistory.map((item) => ({
              ...item,
              active: item.id === activeHistoryId,
            }))}
            onClear={() => {
              setScanHistory([])
              setActiveHistoryId(null)
            }}
            onSelect={handleHistorySelect}
          />
        </>
      }
      filteredCount={rows.length}
      placeholder={t('admin.checkin.searchPlaceholder')}
      query={query}
      showHeader={false}
      showStats
      stats={[
        { label: t('admin.checkin.statReady'), value: statusCounts.ready, tone: 'success' },
        { label: t('admin.checkin.statDone'), value: statusCounts.done, tone: 'default' },
        { label: t('admin.checkin.statPending'), value: statusCounts.pending, tone: 'warning' },
      ]}
      totalCount={allRows.length}
      filters={[
        { id: 'type', label: t('admin.checkin.type'), value: type, onChange: setType, options: typeOptions },
        { id: 'day', label: t('admin.checkin.dayLabel'), value: day, onChange: setDay, options: dayOptions },
        {
          id: 'checkinStatus',
          label: t('admin.checkin.statusLabel'),
          value: checkinStatus,
          onChange: setCheckinStatus,
          options: statusOptions,
        },
      ]}
      onQueryChange={setQuery}
    >
      <DataTable
        variant="admin"
        getRowClassName={(row) => (row.id === highlightRowId ? 'data-table__row--selected' : '')}
        columns={[
          {
            key: 'name',
            label: t('admin.columns.attendee'),
            render: (row) => <AdminIdentityCell name={row.name} sub={row.document} />,
          },
          {
            key: 'type',
            label: t('admin.checkin.type'),
            render: (row) => (row.type === 'atleta' ? t('admin.checkin.athlete') : t('admin.checkin.spectator')),
          },
          { key: 'meta', label: t('admin.columns.category') },
          {
            key: 'day',
            label: t('admin.checkin.dayLabel'),
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
            render: (row) => <StatusBadge value={row.status} />,
          },
          {
            key: 'action',
            label: t('admin.columns.action'),
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
                    onClick={() => handleCheckIn(row)}
                    variant="celeste"
                  />
                </AdminTableActions>
              )
            },
          },
        ]}
        rows={rows}
        emptyMessage={t('admin.checkin.empty')}
      />
    </AdminListSection>
  )
}
