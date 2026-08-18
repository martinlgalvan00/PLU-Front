import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, HelpCircle, XCircle } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { useOfflineCheckinSync } from './useOfflineCheckinSync.js'
import { buildEventTicketAddonReport } from '../lib/ticketAddons.js'
import { parseCredentialScan } from '../lib/credentialQr.js'
import { getFeedbackTone, playCheckinFeedback } from '../lib/checkinFeedback.js'
import { enqueueCheckin, findInAllowlist } from '../lib/offlineCheckinDb.js'
import {
  buildTicketRow,
  registrationCheckinStatus,
  resolveCredentialScan,
} from '../services/checkinScanService.js'
import {
  buildCheckinRows,
  filterCheckinRows,
  summarizeCheckinRows,
} from '../services/checkinWorkspaceService.js'

const MAX_SCAN_HISTORY = 15
const FEEDBACK_STORAGE_KEY = 'plu-checkin-feedback'

export const TYPE_FILTERS = [
  ['all', 'admin.checkin.filterAllTypes'],
  ['atleta', 'admin.checkin.athlete'],
  ['espectador', 'admin.checkin.spectator'],
]

export const STATUS_FILTERS = [
  ['all', 'admin.checkin.filterAllStatuses'],
  ['ready', 'admin.checkin.filterReady'],
  ['done', 'admin.checkin.filterDone'],
  ['pending', 'admin.checkin.filterPending'],
]

export const SCAN_VERDICT_META = {
  ready: { Icon: CheckCircle2, tone: 'success' },
  checked_in: { Icon: CheckCircle2, tone: 'success' },
  already_used: { Icon: AlertTriangle, tone: 'warning' },
  not_ready: { Icon: HelpCircle, tone: 'warning' },
  no_registration: { Icon: HelpCircle, tone: 'warning' },
  not_found: { Icon: XCircle, tone: 'danger' },
  invalid: { Icon: XCircle, tone: 'danger' },
  queued_offline: { Icon: Clock, tone: 'warning' },
}

function isNetworkError(error) {
  return error instanceof TypeError || error?.name === 'AuthRetryableFetchError'
}

function buildOfflineScanResult(found) {
  if (!found) return { outcome: 'not_found', offline: true }

  const { kind, entry } = found
  const alreadyUsed = Boolean(entry.checkedInAt) || entry.checkedInLocally

  if (kind === 'ticket') {
    const outcome = alreadyUsed ? 'already_used' : entry.status === 'pagada' ? 'ready' : 'not_ready'
    return {
      kind: 'ticket',
      outcome,
      offline: true,
      canCheckIn: outcome === 'ready',
      qrToken: entry.qrToken,
      status: alreadyUsed ? 'usada' : entry.status,
      row: {
        id: `tkt-${entry.qrToken}`,
        ticketCode: entry.ticketCode,
        qrToken: entry.qrToken,
        type: 'espectador',
        name: entry.attendeeName,
        document: entry.attendeeDni,
        meta: entry.ticketTypeName ?? entry.ticketCode,
        ticketTypeName: entry.ticketTypeName,
        status: alreadyUsed ? 'usada' : entry.status,
      },
    }
  }

  const status = registrationCheckinStatus({
    status: entry.status,
    checkedInAt: alreadyUsed ? 'offline' : null,
  })
  const outcome = status === 'usada' ? 'already_used' : status === 'pagada' ? 'ready' : 'not_ready'
  return {
    kind: 'registration',
    outcome,
    offline: true,
    canCheckIn: outcome === 'ready',
    registrationId: entry.registrationId,
    status,
    row: {
      id: `reg-${entry.registrationId}`,
      registrationId: entry.registrationId,
      type: 'atleta',
      name: entry.athleteName,
      document: entry.athleteDocument,
      meta: [entry.category, entry.division].filter(Boolean).join(' · '),
      dayIndexes: 'all',
      status,
    },
  }
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
  const name =
    resolved.row?.name ?? resolved.athlete?.fullName ?? resolved.ticket?.attendeeName ?? null
  const document =
    resolved.row?.document ?? resolved.athlete?.documentId ?? resolved.ticket?.attendeeDni ?? null

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    scannedAt: new Date().toISOString(),
    outcome: resolved.outcome ?? 'invalid',
    tone: getFeedbackTone(resolved.outcome ?? 'invalid'),
    name,
    document,
    type:
      resolved.row?.type ??
      (resolved.kind === 'registration'
        ? 'atleta'
        : resolved.kind === 'ticket'
          ? 'espectador'
          : null),
    rowId: resolved.row?.id ?? null,
    checkedIn: false,
    raw,
    snapshot: resolved,
  }
}

export function useCheckInWorkspace({
  athletes,
  canCheckIn,
  eventDays = [],
  eventSlug = 'pitbull-classic-2026',
  onCheckInRegistration,
  onCheckInTicket,
  onRedeemTicketAddon,
  onRefreshTickets,
  registrations,
  ticketTypes = [],
  tickets,
}) {
  const { t } = useI18n()
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
  const offlineSync = useOfflineCheckinSync(eventSlug)

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
          ? { ...item, checkedIn: true, outcome: 'checked_in', tone: getFeedbackTone('checkin_ok') }
          : item,
      ),
    )
  }

  useEffect(() => {
    onRefreshTickets?.(eventSlug)
  }, [eventSlug, onRefreshTickets])

  const allRows = useMemo(
    () => buildCheckinRows({ athletes, registrations, tickets, eventSlug, ticketTypes }),
    [athletes, eventSlug, registrations, ticketTypes, tickets],
  )

  const statusCounts = useMemo(() => summarizeCheckinRows(allRows, eventDays), [allRows, eventDays])

  const addonReport = useMemo(
    () => buildEventTicketAddonReport(tickets, eventSlug),
    [eventSlug, tickets],
  )

  const typeOptions = useMemo(() => TYPE_FILTERS.map(([value, key]) => [value, t(key)]), [t])
  const dayOptions = useMemo(
    () => [
      ['all', t('admin.checkin.filterAllDays')],
      ...eventDays.map((eventDay) => [eventDay.dayIndex, eventDay.label]),
    ],
    [eventDays, t],
  )
  const filteredScopeCounts = useMemo(
    () => summarizeCheckinRows(filterCheckinRows(allRows, { type, day }), eventDays),
    [allRows, day, eventDays, type],
  )
  const statusOptions = useMemo(
    () =>
      STATUS_FILTERS.map(([value, key]) => {
        const count =
          value === 'all'
            ? filteredScopeCounts.total
            : value === 'ready'
              ? filteredScopeCounts.ready
              : value === 'done'
                ? filteredScopeCounts.done
                : filteredScopeCounts.pending
        return [value, t(key), count]
      }),
    [filteredScopeCounts, t],
  )

  const rows = useMemo(
    () => filterCheckinRows(allRows, { query, type, day, status: checkinStatus }),
    [allRows, checkinStatus, day, query, type],
  )

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
        // `staff` pide la proyección con documento: el workspace solo se
        // renderiza detrás de admin.checkin.execute, que es el mismo permiso
        // que exige el endpoint.
        const resolved = await resolveCredentialScan(parsed, {
          defaultEventSlug: eventSlug,
          staff: canCheckIn,
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
        if (isNetworkError(error)) {
          const found = await findInAllowlist(eventSlug, parsed.code)
          const offlineResult = buildOfflineScanResult(found)
          setScanResult(offlineResult)
          setRedeemError('')
          prependHistoryEntry(buildHistoryEntry(offlineResult, raw))
          playCheckinFeedback(offlineResult.outcome ?? 'invalid', feedbackPrefs)
          if (offlineResult.row?.id) setHighlightRowId(offlineResult.row.id)
          setScanBusy(false)
          return
        }

        console.error('checkin scan:', error)
        const notFoundResult = { outcome: 'not_found' }
        setScanResult(notFoundResult)
        prependHistoryEntry(buildHistoryEntry(notFoundResult, raw))
        playCheckinFeedback('not_found', feedbackPrefs)
      } finally {
        setScanBusy(false)
      }
    },
    [canCheckIn, eventSlug, feedbackPrefs],
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
      const result = await onCheckInRegistration(row.registrationId)
      if (result?.outcome === 'ok') {
        playCheckinFeedback('checkin_ok', feedbackPrefs)
        if (activeHistoryId) markHistoryCheckedIn(activeHistoryId)
        setScanResult((current) =>
          current?.row?.id === row.id
            ? { ...current, outcome: 'checked_in', canCheckIn: false, status: 'usada' }
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
          ? { ...current, outcome: 'checked_in', canCheckIn: false, status: 'usada' }
          : current,
      )
    }
  }

  async function handleScanCheckIn() {
    if (!scanResult?.canCheckIn || !canCheckIn) return

    if (scanResult.offline || !offlineSync.isOnline) {
      await enqueueCheckin({
        eventSlug,
        kind: scanResult.kind,
        qrToken: scanResult.kind === 'ticket' ? scanResult.qrToken : null,
        registrationId: scanResult.kind === 'registration' ? scanResult.registrationId : null,
      })
      playCheckinFeedback('queued_offline', feedbackPrefs)
      if (activeHistoryId) {
        setScanHistory((current) =>
          current.map((item) =>
            item.id === activeHistoryId
              ? {
                  ...item,
                  checkedIn: true,
                  outcome: 'queued_offline',
                  tone: getFeedbackTone('queued_offline'),
                }
              : item,
          ),
        )
      }
      setScanResult({
        ...scanResult,
        outcome: 'queued_offline',
        canCheckIn: false,
        status: 'usada',
      })
      offlineSync.refreshCounts()
      return
    }

    if (scanResult.kind === 'ticket') {
      const result = await onCheckInTicket(scanResult.qrToken)
      onRefreshTickets?.(eventSlug)
      if (result?.outcome === 'ok' || result?.outcome === 'already_used') {
        playCheckinFeedback(result.outcome === 'ok' ? 'checkin_ok' : 'already_used', feedbackPrefs)
        if (activeHistoryId) markHistoryCheckedIn(activeHistoryId)
        const nextTicket = result.ticket ?? scanResult.ticket
        setScanResult({
          ...scanResult,
          outcome: result.outcome === 'ok' ? 'checked_in' : 'already_used',
          canCheckIn: false,
          status: 'usada',
          ticket: nextTicket,
          row: nextTicket ? buildTicketRow(nextTicket) : scanResult.row,
        })
      }
      return
    }

    if (scanResult.kind === 'registration') {
      const result = await onCheckInRegistration(scanResult.registrationId)
      if (result?.outcome === 'ok') {
        playCheckinFeedback('checkin_ok', feedbackPrefs)
        if (activeHistoryId) markHistoryCheckedIn(activeHistoryId)
        setScanResult({ ...scanResult, outcome: 'checked_in', canCheckIn: false, status: 'usada' })
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

  const scanVerdict = scanResult
    ? (SCAN_VERDICT_META[scanResult.outcome] ?? SCAN_VERDICT_META.invalid)
    : null
  const scanPersonName =
    scanResult?.row?.name ?? scanResult?.athlete?.fullName ?? scanResult?.ticket?.attendeeName
  const scanPersonDoc =
    scanResult?.row?.document ?? scanResult?.athlete?.documentId ?? scanResult?.ticket?.attendeeDni
  const scanTicketPaid =
    scanResult?.kind === 'ticket' &&
    (['pagada', 'usada'].includes(scanResult.ticket?.status) ||
      scanResult.status === 'usada' ||
      Boolean(scanResult.ticket?.checkedInAt))

  return {
    activeHistoryId,
    addonReport,
    allRows,
    canCheckIn,
    checkinStatus,
    day,
    dayOptions,
    feedbackPrefs,
    handleCheckIn,
    handleHistorySelect,
    handleRedeemAddon,
    handleScan,
    handleScanCheckIn,
    highlightRowId,
    offlineSync,
    persistFeedbackPrefs,
    query,
    redeemBusyId,
    redeemError,
    rows,
    scanBusy,
    scanHistory,
    scanPersonDoc,
    scanPersonName,
    scanResult,
    scanTicketPaid,
    scanVerdict,
    setCheckinStatus,
    setDay,
    setQuery,
    setScanHistory,
    setScanResult,
    setActiveHistoryId,
    setType,
    statusCounts,
    statusOptions,
    type,
    typeOptions,
  }
}
