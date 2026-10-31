import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, HelpCircle, XCircle } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { useOfflineCheckinSync } from './useOfflineCheckinSync.js'
import { buildEventTicketAddonReport } from '../lib/ticketAddons.js'
import { parseCredentialScan } from '../lib/credentialQr.js'
import { prepareCheckinScan } from '../lib/doorSpokenCode.js'
import { announceCheckinVerdict } from '../lib/doorCodeSpeech.js'
import { getFeedbackTone, playCheckinFeedback } from '../lib/checkinFeedback.js'
import { isSnapshotFresh } from '../lib/checkinSyncConfig.js'
import { enqueueCheckin, findInAllowlist, getAllowlist } from '../lib/offlineCheckinDb.js'
import { credentialOpensZone } from '../services/securityZoneService.js'
import { TICKET_VALIDITY_STATUS, ticketValidityStatus } from '../lib/ticketValidity.js'
import {
  applyTicketZoneOutcome,
  buildTicketRow,
  canAdmitCheckinRow,
  registrationCheckinStatus,
  resolveCredentialScan,
} from '../services/checkinScanService.js'
import {
  applyServerAdmissions,
  buildCheckinRows,
  filterCheckinRows,
  mapAllowlistToCheckinSources,
  summarizeCheckinRows,
} from '../services/checkinWorkspaceService.js'
import { resolveDoorScan } from '../services/checkinScanBudget.js'
import { downloadAllowlist as refreshCheckinAllowlist } from '../services/offlineCheckinSync.js'
import { reportScanAttempt } from '../services/checkinTelemetry.js'
import { classifyCheckinFailure, isRetryableCheckinFailure } from '../services/checkinFailure.js'
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js'
import { readCheckinBroadcastSlug } from '../services/checkinRealtime.js'

const MAX_SCAN_HISTORY = 15
const COUNTER_REFRESH_MS = 30_000
const FEEDBACK_STORAGE_KEY = 'plu-checkin-feedback'

export const TYPE_FILTERS = [
  ['all', 'admin.checkin.filterAllTypes'],
  ['atleta', 'admin.checkin.athlete'],
  ['espectador', 'admin.checkin.spectator'],
  ['coach', 'admin.checkin.coach'],
]

export const STATUS_FILTERS = [
  ['all', 'admin.checkin.filterAllStatuses'],
  ['ready', 'admin.checkin.filterReady'],
  ['done', 'admin.checkin.filterDone'],
  ['unpaid', 'admin.checkin.filterUnpaid'],
  ['pending', 'admin.checkin.filterPending'],
  // Sólo aparece cuando hay algo que cobrar: ver `statusOptions`.
  ['to_validate', 'admin.checkin.filterToValidate'],
]

/** Contador de `summarizeCheckinRows` que le corresponde a cada filtro. */
const STATUS_FILTER_COUNT_KEYS = Object.freeze({
  all: 'total',
  ready: 'ready',
  done: 'done',
  unpaid: 'unpaid',
  pending: 'pending',
  to_validate: 'toValidate',
})

export const SCAN_VERDICT_META = {
  ready: { Icon: CheckCircle2, tone: 'success' },
  checked_in: { Icon: CheckCircle2, tone: 'success' },
  already_used: { Icon: AlertTriangle, tone: 'warning' },
  not_ready: { Icon: HelpCircle, tone: 'warning' },
  no_registration: { Icon: HelpCircle, tone: 'warning' },
  not_found: { Icon: XCircle, tone: 'danger' },
  invalid: { Icon: XCircle, tone: 'danger' },
  queued_offline: { Icon: Clock, tone: 'warning' },
  wrong_zone: { Icon: AlertTriangle, tone: 'warning' },
  not_yet_valid: { Icon: Clock, tone: 'warning' },
  expired: { Icon: XCircle, tone: 'danger' },
  // No son veredictos sobre el QR: el servidor no pudo contestar, o la sesión
  // del puesto venció. Se muestran como lo que son, nunca como "no encontrada".
  service_unavailable: { Icon: AlertTriangle, tone: 'warning' },
  session_expired: { Icon: XCircle, tone: 'danger' },
  door_malformed: { Icon: HelpCircle, tone: 'warning' },
  rate_limited: { Icon: AlertTriangle, tone: 'warning' },
}

/**
 * `checkInTicketAction` (useAppData.js) devuelve el outcome que clasificó
 * `checkinRejectionOutcome` por código PLU. Acá sólo se traduce al outcome de
 * UI que ya sabe render `SCAN_VERDICT_META` — `not_paid` sigue llamándose
 * `not_ready` en la UI por compatibilidad con el resto del workspace.
 */
const CHECKIN_REJECTION_UI_OUTCOME = Object.freeze({
  wrong_zone: 'wrong_zone',
  not_paid: 'not_ready',
  expired: 'expired',
  not_yet_valid: 'not_yet_valid',
})

/** Rechequeo local previo a admitir: el backend repite esta misma barrera. */
function ticketTemporalOutcome(ticket) {
  const validity = ticketValidityStatus(ticket)
  if (validity === TICKET_VALIDITY_STATUS.EXPIRED) return 'expired'
  if (validity === TICKET_VALIDITY_STATUS.UPCOMING) return 'not_yet_valid'
  return null
}

function buildOfflineScanResult(found, zoneScope) {
  if (!found) return { outcome: 'not_found', offline: true }

  const { kind, entry } = found
  const alreadyUsed = Boolean(entry.checkedInAt) || entry.checkedInLocally

  if (kind === 'ticket') {
    const validity = ticketValidityStatus(entry)
    const outcome = alreadyUsed
      ? 'already_used'
      : entry.status !== 'pagada'
        ? 'not_ready'
        : validity === TICKET_VALIDITY_STATUS.UPCOMING
          ? 'not_yet_valid'
          : validity === TICKET_VALIDITY_STATUS.EXPIRED
            ? 'expired'
            : 'ready'
    return applyTicketZoneOutcome(
      {
        kind: 'ticket',
        outcome,
        offline: true,
        canCheckIn: outcome === 'ready',
        qrToken: entry.qrToken,
        status: alreadyUsed ? 'usada' : entry.status,
        row: {
          id: `tkt-${entry.qrToken}`,
          ticketCode: entry.ticketCode,
          gateCode: entry.gateCode ?? null,
          qrToken: entry.qrToken,
          type: 'espectador',
          name: entry.attendeeName,
          document: entry.attendeeDni,
          meta: entry.ticketTypeName ?? entry.ticketCode,
          ticketTypeName: entry.ticketTypeName,
          ticketTypeDescription: entry.ticketTypeDescription ?? null,
          // Sin señal en la puerta esto es lo único que tiene el escáner.
          credentialLabel: entry.credentialLabel ?? null,
          credentialScopes: entry.credentialScopes ?? [],
          status: alreadyUsed ? 'usada' : entry.status,
          validFrom: entry.validFrom ?? null,
          validUntil: entry.validUntil ?? null,
        },
      },
      zoneScope,
    )
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
    credentialLabel: resolved.row?.credentialLabel ?? resolved.ticket?.credentialLabel ?? null,
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
  payments = [],
  registrations,
  /** Puesto de quien opera. Nulo = no filtra zona (misma regla que el API). */
  securityZone = null,
  ticketTypes = [],
  tickets,
}) {
  const { locale, t } = useI18n()
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [day, setDay] = useState('all')
  const [checkinStatus, setCheckinStatus] = useState('all')
  const [credential, setCredential] = useState('all')
  const [scanResult, setScanResult] = useState(null)
  const [scanBusy, setScanBusy] = useState(false)
  const checkInLockRef = useRef(false)
  // Un QR lento no puede pisar el resultado de uno más nuevo: con dos
  // escaneos seguidos la respuesta tardía mostraba la persona equivocada.
  const scanSeqRef = useRef(0)
  // El ingreso ya se encoló o se confirmó: una respuesta tardía no lo reabre.
  const scanSettledRef = useRef(false)
  const [highlightRowId, setHighlightRowId] = useState(null)
  const [scanHistory, setScanHistory] = useState([])
  const [activeHistoryId, setActiveHistoryId] = useState(null)
  const [feedbackPrefs, setFeedbackPrefs] = useState(readFeedbackPrefs)
  const [redeemBusyId, setRedeemBusyId] = useState(null)
  const [redeemError, setRedeemError] = useState('')
  const [allowlistSources, setAllowlistSources] = useState(null)
  const [localAdmittedIds, setLocalAdmittedIds] = useState(() => new Set())
  const offlineSync = useOfflineCheckinSync(eventSlug)
  const noteSnapshot = offlineSync.noteSnapshot
  const pullAllowlist = offlineSync.downloadAllowlist
  const drainAndPull = offlineSync.reloadAndSync
  const liveRefreshTimer = useRef(null)
  const admissionBaselineSlug = useRef(null)
  const admissionPullGen = useRef(0)
  const zoneScope = securityZone?.scope ?? null

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

  useEffect(() => {
    if ((registrations?.length ?? 0) > 0 || !eventSlug) return undefined
    let live = true

    async function hydrate() {
      let cached = null
      try {
        cached = await getAllowlist(eventSlug)
      } catch {
        cached = null
      }
      if (!live) return
      if (cached) {
        setAllowlistSources(mapAllowlistToCheckinSources(cached, eventSlug))
        noteSnapshot?.(cached.downloadedAt)
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      if (isSnapshotFresh(cached?.downloadedAt)) return
      try {
        const saved = await refreshCheckinAllowlist(eventSlug)
        if (!live || !saved) return
        setAllowlistSources(mapAllowlistToCheckinSources(saved, eventSlug))
        noteSnapshot?.(saved.downloadedAt)
      } catch {
        // Sin red o sin permiso de bajarla: queda la foto que ya estaba.
      }
    }

    hydrate()
    return () => {
      live = false
    }
  }, [eventSlug, noteSnapshot, registrations])

  const applyAllowlist = useCallback(
    (saved) => {
      if (!saved || !eventSlug) return
      setAllowlistSources(mapAllowlistToCheckinSources(saved, eventSlug))
      noteSnapshot?.(saved.downloadedAt)
    },
    [eventSlug, noteSnapshot],
  )

  const reloadAndSync = useCallback(async () => {
    if (!drainAndPull) return null
    const saved = await drainAndPull()
    applyAllowlist(saved)
    return saved
  }, [applyAllowlist, drainAndPull])

  const refreshLiveCheckins = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    if (liveRefreshTimer.current) window.clearTimeout(liveRefreshTimer.current)
    liveRefreshTimer.current = window.setTimeout(() => {
      liveRefreshTimer.current = null
      onRefreshTickets?.(eventSlug)
      Promise.resolve()
        .then(() => pullAllowlist?.())
        .then(applyAllowlist)
        .catch(() => {})
    }, 400)
  }, [applyAllowlist, eventSlug, onRefreshTickets, pullAllowlist])

  // Con varias puertas abiertas los contadores sólo se movían con los ingresos
  // de ESTE equipo. Cada tanto se piden de nuevo las entradas y la foto de
  // ingresos, y sólo con la pestaña a la vista: de fondo o sin señal no aporta.
  useEffect(() => {
    if (!eventSlug || !onRefreshTickets) return undefined
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return
      refreshLiveCheckins()
    }, COUNTER_REFRESH_MS)
    return () => window.clearInterval(intervalId)
  }, [eventSlug, onRefreshTickets, refreshLiveCheckins])

  useEffect(
    () => () => {
      if (liveRefreshTimer.current) window.clearTimeout(liveRefreshTimer.current)
    },
    [],
  )

  useEffect(() => {
    const hasLiveList = (registrations?.length ?? 0) > 0 || (tickets?.length ?? 0) > 0
    if (!eventSlug || !hasLiveList || admissionBaselineSlug.current === eventSlug) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    admissionBaselineSlug.current = eventSlug
    const generation = ++admissionPullGen.current
    Promise.resolve()
      .then(() => pullAllowlist?.())
      .then((saved) => {
        if (admissionPullGen.current !== generation) return
        applyAllowlist(saved)
      })
      .catch(() => {
        if (admissionPullGen.current === generation) admissionBaselineSlug.current = null
      })
  }, [applyAllowlist, eventSlug, pullAllowlist, registrations?.length, tickets?.length])

  useEffect(() => {
    if (!eventSlug || !isSupabaseConfigured) return undefined
    let disposed = false
    let client = null
    let channel = null

    void getSupabaseClient()
      .then((supabase) => {
        if (disposed || !supabase) return
        client = supabase
        channel = supabase
          .channel(`event-checkin:${eventSlug}`, { config: { broadcast: { self: false } } })
          .on('broadcast', { event: 'checkin-changed' }, (message) => {
            if (readCheckinBroadcastSlug(message) !== eventSlug) return
            void refreshLiveCheckins()
          })
          .subscribe()
      })
      .catch(() => {})

    return () => {
      disposed = true
      if (client && channel) void client.removeChannel(channel)
    }
  }, [eventSlug, refreshLiveCheckins])

  const allRows = useMemo(() => {
    const rows = applyServerAdmissions(
      buildCheckinRows({
        athletes: athletes?.length ? athletes : (allowlistSources?.athletes ?? []),
        payments,
        registrations: registrations?.length
          ? registrations
          : (allowlistSources?.registrations ?? []),
        tickets: tickets?.length ? tickets : (allowlistSources?.tickets ?? []),
        eventSlug,
        ticketTypes,
      }),
      allowlistSources,
    )
    if (localAdmittedIds.size === 0) return rows
    return rows.map((row) =>
      localAdmittedIds.has(row.id) ? { ...row, status: 'usada' } : row,
    )
  }, [
    allowlistSources,
    athletes,
    eventSlug,
    localAdmittedIds,
    payments,
    registrations,
    ticketTypes,
    tickets,
  ])

  useEffect(() => {
    setScanResult((current) => {
      if (!current?.canCheckIn) return current
      const match = allRows.find((row) => {
        if (current.kind === 'registration') return row.registrationId === current.registrationId
        if (current.kind === 'ticket') return Boolean(row.qrToken) && row.qrToken === current.qrToken
        return false
      })
      if (!match || match.status !== 'usada' || !match.checkedInAt || match.checkedInAt === 'offline') {
        return current
      }
      return {
        ...current,
        outcome: 'already_used',
        canCheckIn: false,
        status: 'usada',
      }
    })
  }, [allRows])

  const statusCounts = useMemo(() => summarizeCheckinRows(allRows, eventDays), [allRows, eventDays])

  const addonReport = useMemo(
    () => buildEventTicketAddonReport(tickets, eventSlug),
    [eventSlug, tickets],
  )

  const typeOptions = useMemo(() => TYPE_FILTERS.map(([value, key]) => [value, t(key)]), [t])
  const credentialOptions = useMemo(() => {
    const labels = [...new Set(allRows.map((row) => row.credentialLabel).filter(Boolean))].sort(
      (left, right) => left.localeCompare(right, 'es'),
    )
    if (!labels.length) return []
    return [
      ['all', t('admin.checkin.filterAllCredentials')],
      ...labels.map((label) => [label, label]),
    ]
  }, [allRows, t])
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
      STATUS_FILTERS
        // "Por cobrar" no es un estado permanente de la puerta: sin órdenes
        // abiertas el filtro sería una opción que siempre da cero.
        .filter(([value]) => {
          if (value === 'to_validate') return filteredScopeCounts.toValidate > 0
          if (value === 'unpaid') return filteredScopeCounts.unpaid > 0
          return true
        })
        .map(([value, key]) => [
          value,
          t(key),
          filteredScopeCounts[STATUS_FILTER_COUNT_KEYS[value] ?? 'pending'],
        ]),
    [filteredScopeCounts, t],
  )

  const rows = useMemo(
    () => filterCheckinRows(allRows, { query, type, day, status: checkinStatus, credential }),
    [allRows, checkinStatus, credential, day, query, type],
  )

  const handleScan = useCallback(
    async (raw) => {
      const prepared = prepareCheckinScan(raw)
      const scanRaw = prepared.kind === 'door' ? prepared.display : prepared.raw || String(raw ?? '')

      if (prepared.kind === 'malformed') {
        const invalidResult = {
          outcome: 'door_malformed',
          reason: prepared.reason ?? 'length',
          heard: prepared.heard ?? 0,
          repairs: prepared.repairs ?? ['speech'],
        }
        setScanResult(invalidResult)
        prependHistoryEntry(buildHistoryEntry(invalidResult, scanRaw))
        playCheckinFeedback('door_malformed', feedbackPrefs)
        if (feedbackPrefs.soundEnabled) announceCheckinVerdict({ outcome: 'door_malformed' }, { locale })
        reportScanAttempt({ eventSlug, kind: 'unknown', outcome: 'door_malformed' })
        return
      }

      const parsed = prepared.kind === 'credential' ? prepared.parsed : parseCredentialScan(scanRaw)
      if (!parsed?.code) {
        const invalidResult = { outcome: 'invalid' }
        setScanResult(invalidResult)
        prependHistoryEntry(buildHistoryEntry(invalidResult, scanRaw))
        playCheckinFeedback('invalid', feedbackPrefs)
        if (feedbackPrefs.soundEnabled) announceCheckinVerdict({ outcome: 'invalid' }, { locale })
        reportScanAttempt({ eventSlug, kind: 'unknown', outcome: 'invalid' })
        return
      }

      const scanSeq = ++scanSeqRef.current
      scanSettledRef.current = false
      const isStale = () => scanSeq !== scanSeqRef.current
      setScanBusy(true)
      setScanResult(null)

      let shownOutcome = null
      const publish = (result, { correct = false } = {}) => {
        if (isStale() || scanSettledRef.current) return
        const next =
          prepared.kind === 'door' && result
            ? {
                ...result,
                gateCode: result.gateCode || result.ticket?.gateCode || result.row?.gateCode || prepared.display,
                repairs: result.repairs ?? prepared.repairs,
              }
            : result
        const nextOutcome = next.outcome ?? 'invalid'
        const sameVerdict = correct && shownOutcome === nextOutcome
        shownOutcome = nextOutcome
        setScanResult(next)
        setRedeemError('')
        if (sameVerdict) return
        if (correct) {
          setScanHistory((current) => {
            const [latest, ...rest] = current
            if (!latest || latest.raw !== scanRaw) return current
            if (latest.outcome === 'queued_offline' || latest.outcome === 'checked_in') return current
            const entry = buildHistoryEntry(next, scanRaw)
            return [{ ...entry, id: latest.id, scannedAt: latest.scannedAt }, ...rest]
          })
        } else {
          prependHistoryEntry(buildHistoryEntry(next, scanRaw))
        }
        playCheckinFeedback(nextOutcome, feedbackPrefs)
        if (feedbackPrefs.soundEnabled) {
          announceCheckinVerdict(
            {
              outcome: nextOutcome,
              name: next.row?.name ?? next.athlete?.fullName ?? next.ticket?.attendeeName,
              credentialLabel: next.row?.credentialLabel ?? next.ticket?.credentialLabel,
            },
            { locale },
          )
        }
        if (result.row?.id) setHighlightRowId(result.row.id)
        if (result.outcome !== 'session_expired') {
          reportScanAttempt({
            eventSlug,
            kind: result.kind ?? 'unknown',
            outcome: result.outcome ?? 'invalid',
            qrToken: result.qrToken ?? null,
            offline: Boolean(result.offline),
          })
        }
      }

      const publishFailure = (error) => {
        const failure = classifyCheckinFailure(error)
        if (isRetryableCheckinFailure(error)) return false
        console.error('checkin scan:', error)
        const failedOutcome = failure === 'auth' ? 'session_expired' : 'not_found'
        publish({ outcome: failedOutcome })
        return true
      }

      try {
        // `staff` pide la proyección con documento: el workspace solo se
        // renderiza detrás de admin.checkin.execute, que es el mismo permiso
        // que exige el endpoint. Si la red no contesta enseguida, se muestra
        // la foto local y el servidor corrige después.
        const decision = await resolveDoorScan({
          online: typeof navigator === 'undefined' || navigator.onLine !== false,
          readLocal: () => findInAllowlist(eventSlug, parsed.code),
          readNetwork: () =>
            resolveCredentialScan(parsed, {
              defaultEventSlug: eventSlug,
              staff: canCheckIn,
              zoneScope,
            }),
          onNetwork: (late) => {
            if (isStale() || checkInLockRef.current || scanSettledRef.current) return
            if (late.source === 'network') {
              publish(late.value, { correct: true })
              return
            }
            publishFailure(late.error)
          },
        })
        if (isStale()) return
        if (decision.source === 'network') {
          publish(decision.value)
          return
        }
        if (decision.source === 'network-error') {
          if (publishFailure(decision.error)) return
          const found = await findInAllowlist(eventSlug, parsed.code)
          if (isStale()) return
          if (found) {
            publish(buildOfflineScanResult(found, zoneScope))
            return
          }
          const lockedDoorCode =
            classifyCheckinFailure(decision.error) === 'rate_limited' &&
            /códigos incorrectos/i.test(String(decision.error?.message ?? ''))
          publish(
            lockedDoorCode
              ? { outcome: 'rate_limited', gateCode: prepared.display ?? null }
              : { outcome: 'service_unavailable', offline: true },
          )
          return
        }
        publish(
          decision.local
            ? buildOfflineScanResult(decision.local, zoneScope)
            : { outcome: 'service_unavailable', offline: true },
        )
      } catch (error) {
        if (isStale()) return
        publishFailure(error)
      } finally {
        if (!isStale()) setScanBusy(false)
      }
    },
    [canCheckIn, eventSlug, feedbackPrefs, locale, zoneScope],
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

  function rememberAdmitted(rowId) {
    if (!rowId) return
    setLocalAdmittedIds((current) => {
      if (current.has(rowId)) return current
      const next = new Set(current)
      next.add(rowId)
      return next
    })
  }

  async function queueAdmission(row) {
    await enqueueCheckin({
      eventSlug,
      kind: row.type === 'atleta' ? 'registration' : 'ticket',
      qrToken: row.type === 'atleta' ? null : (row.qrToken ?? null),
      registrationId: row.type === 'atleta' ? row.registrationId : null,
      gate: securityZone?.name ?? null,
      label: row.ticketCode || row.name || null,
    })
    rememberAdmitted(row.id)
    scanSettledRef.current = true
    playCheckinFeedback('queued_offline', feedbackPrefs)
    offlineSync.refreshCounts?.()
  }

  async function handleCheckIn(row) {
    if (!canCheckIn || checkInLockRef.current) return
    checkInLockRef.current = true
    setHighlightRowId(row.id)

    try {
      await admitFromList(row)
    } finally {
      checkInLockRef.current = false
    }
  }

  async function admitFromList(row) {
    if (row.type === 'atleta') {
      if (!offlineSync.isOnline) {
        await queueAdmission(row)
        return
      }
      try {
        const result = await onCheckInRegistration(row.registrationId)
        if (result?.outcome === 'ok' || result?.outcome === 'already_used') {
          rememberAdmitted(row.id)
          playCheckinFeedback(
            result.outcome === 'ok' ? 'checkin_ok' : 'already_used',
            feedbackPrefs,
          )
          if (activeHistoryId) markHistoryCheckedIn(activeHistoryId)
          if (result.outcome === 'already_used') {
            setScanResult({
              kind: 'registration',
              outcome: 'already_used',
              canCheckIn: false,
              registrationId: row.registrationId,
              status: 'usada',
              row: { ...row, status: 'usada' },
            })
          }
          return
        }
        const rejected =
          result?.outcome === 'not_paid'
            ? 'not_ready'
            : result?.outcome === 'not_found'
              ? 'not_found'
              : result?.outcome === 'forbidden'
                ? 'not_ready'
                : null
        if (rejected) {
          playCheckinFeedback(rejected, feedbackPrefs)
          setScanResult({
            kind: 'registration',
            outcome: rejected,
            canCheckIn: false,
            registrationId: row.registrationId,
            status: row.status,
            row,
          })
        }
      } catch (error) {
        if (isRetryableCheckinFailure(error)) {
          await queueAdmission(row)
          return
        }
        console.error('checkin registration:', error)
      }
      return
    }

    if (row.type !== 'atleta' && !credentialOpensZone(row.credentialScopes, zoneScope)) {
      playCheckinFeedback('wrong_zone', feedbackPrefs)
      setScanResult({
        kind: 'ticket',
        outcome: 'wrong_zone',
        canCheckIn: false,
        qrToken: row.qrToken,
        status: row.status,
        row,
      })
      return
    }

    const temporalOutcome = ticketTemporalOutcome(row)
    if (temporalOutcome) {
      const temporalResult = {
        kind: 'ticket',
        outcome: temporalOutcome,
        canCheckIn: false,
        qrToken: row.qrToken,
        status: row.status,
        row,
      }
      playCheckinFeedback(temporalOutcome, feedbackPrefs)
      setScanResult(temporalResult)
      prependHistoryEntry(buildHistoryEntry(temporalResult, row.qrToken ?? ''))
      reportScanAttempt({
        eventSlug,
        kind: 'ticket',
        outcome: temporalOutcome,
        qrToken: row.qrToken,
      })
      return
    }

    if (!offlineSync.isOnline) {
      await queueAdmission(row)
      return
    }

    try {
      const result = await onCheckInTicket(row.qrToken)
      onRefreshTickets?.(eventSlug)

      if (result?.outcome === 'ok') {
        rememberAdmitted(row.id)
        playCheckinFeedback('checkin_ok', feedbackPrefs)
        if (activeHistoryId) markHistoryCheckedIn(activeHistoryId)
        setScanResult((current) =>
          current?.row?.id === row.id
            ? { ...current, outcome: 'checked_in', canCheckIn: false, status: 'usada' }
            : current,
        )
        return
      }

      const uiOutcome = CHECKIN_REJECTION_UI_OUTCOME[result?.outcome]
      if (uiOutcome) {
        playCheckinFeedback(uiOutcome, feedbackPrefs)
        setScanResult({
          kind: 'ticket',
          outcome: uiOutcome,
          canCheckIn: false,
          qrToken: row.qrToken,
          status: row.status,
          row,
        })
      }
    } catch (error) {
      if (isRetryableCheckinFailure(error)) {
        await queueAdmission(row)
        return
      }
      console.error('checkin ticket:', error)
    }
  }

  async function handleScanCheckIn() {
    if (!scanResult?.canCheckIn || !canCheckIn || checkInLockRef.current) return

    if (scanResult.kind === 'ticket') {
      const temporalOutcome = ticketTemporalOutcome(scanResult.row ?? scanResult.ticket)
      if (temporalOutcome) {
        const temporalResult = { ...scanResult, outcome: temporalOutcome, canCheckIn: false }
        playCheckinFeedback(temporalOutcome, feedbackPrefs)
        setScanResult(temporalResult)
        prependHistoryEntry(buildHistoryEntry(temporalResult, scanResult.qrToken ?? ''))
        reportScanAttempt({
          eventSlug,
          kind: 'ticket',
          outcome: temporalOutcome,
          qrToken: scanResult.qrToken,
        })
        return
      }
    }

    checkInLockRef.current = true
    setScanBusy(true)
    try {
      await runScanCheckIn()
    } catch (error) {
      console.error('checkin:', error)
      const hasTarget = Boolean(scanResult.qrToken || scanResult.registrationId)
      // Con `navigator.onLine` en true pero el pedido caído (señal de un solo
      // palito, 5xx, 429) el guardia quedaba con "inválido" y la persona sin
      // entrar. Se encola igual: si el servidor sí lo registró, la
      // sincronización recibe PLU06 y queda como conflicto benigno.
      if (isRetryableCheckinFailure(error) && hasTarget) {
        try {
          await queueScanOffline()
          return
        } catch (queueError) {
          console.error('checkin queue:', queueError)
        }
      }
      const failedOutcome = classifyCheckinFailure(error) === 'auth' ? 'session_expired' : 'invalid'
      playCheckinFeedback(failedOutcome, feedbackPrefs)
      setScanResult((current) =>
        current ? { ...current, outcome: failedOutcome, canCheckIn: false } : current,
      )
    } finally {
      checkInLockRef.current = false
      setScanBusy(false)
    }
  }

  async function queueScanOffline() {
    await enqueueCheckin({
      eventSlug,
      kind: scanResult.kind,
      qrToken: scanResult.kind === 'ticket' ? scanResult.qrToken : null,
      registrationId: scanResult.kind === 'registration' ? scanResult.registrationId : null,
      gate: securityZone?.name ?? null,
      label: scanResult.row?.ticketCode || scanResult.row?.name || null,
    })
    scanSettledRef.current = true
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
  }

  async function runScanCheckIn() {
    if (scanResult.offline || !offlineSync.isOnline) {
      await queueScanOffline()
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
        return
      }
      const uiOutcome = CHECKIN_REJECTION_UI_OUTCOME[result?.outcome]
      if (uiOutcome) {
        playCheckinFeedback(uiOutcome, feedbackPrefs)
        setScanResult({
          ...scanResult,
          outcome: uiOutcome,
          canCheckIn: false,
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
    canAdmitRow: (row) => canAdmitCheckinRow(row, { canCheckIn, zoneScope }),
    canCheckIn,
    checkinStatus,
    credential,
    credentialOptions,
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
    reloadAndSync,
    rows,
    scanBusy,
    scanHistory,
    scanPersonDoc,
    scanPersonName,
    scanResult,
    scanTicketPaid,
    scanVerdict,
    setCheckinStatus,
    setCredential,
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
