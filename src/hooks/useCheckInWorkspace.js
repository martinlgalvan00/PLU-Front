import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, HelpCircle, XCircle } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { useOfflineCheckinSync } from './useOfflineCheckinSync.js'
import { useBroadcastTopic } from './useBroadcastTopic.js'
import { buildEventTicketAddonReport } from '../lib/ticketAddons.js'
import { parseCredentialScan } from '../lib/credentialQr.js'
import { getFeedbackTone, playCheckinFeedback } from '../lib/checkinFeedback.js'
import {
  enqueueCheckin,
  findInAllowlist,
  findMatchesInAllowlist,
} from '../lib/offlineCheckinDb.js'
import {
  checkinLookupQuery,
  needsCheckinLookup,
  parseManualCheckinCode,
} from '../lib/manualCheckinCode.js'
import { lookupCheckinCredentials } from '../services/ticketApi.js'
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
  buildCheckinRows,
  filterCheckinRows,
  mapAllowlistToCheckinSources,
  summarizeCheckinRows,
} from '../services/checkinWorkspaceService.js'
import { getEventCheckinAllowlist } from '../services/athleteApi.js'
import { reportScanAttempt } from '../services/checkinTelemetry.js'
import { classifyCheckinFailure, isRetryableCheckinFailure } from '../services/checkinFailure.js'

const MAX_SCAN_HISTORY = 15
const COUNTER_REFRESH_MS = 30_000
// Con Realtime conectado los avisos traen los cambios al instante: el sondeo
// queda como red de seguridad, más espaciado.
const COUNTER_REFRESH_LIVE_MS = 120_000
// La lista de la puerta (y la offline) se baja entera: en plena entrada no
// puede repetirse en cada aviso. Con varias puertas en el mismo wifi, releerla
// por cada ingreso agotaba el límite de pedidos por IP y los escaneos mismos
// empezaban a rebotar con 429.
const ALLOWLIST_REFRESH_MIN_MS = 20_000
const OPS_EVENTS = ['checkin-changed', 'tickets-changed']
// Ventana de agrupado de los avisos de la puerta: el aviso de un ingreso llega
// también a la puerta que lo registró (lo emite la base), así que en hora pico
// hay uno cada pocos segundos. Contadores al día en <5 s, una relectura por
// ventana como mucho.
const OPS_REALTIME_OPTIONS = { debounceMs: 1500, maxWaitMs: 5000 }
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
  ['pending', 'admin.checkin.filterPending'],
  // Sólo aparece cuando hay algo que cobrar: ver `statusOptions`.
  ['to_validate', 'admin.checkin.filterToValidate'],
]

/** Contador de `summarizeCheckinRows` que le corresponde a cada filtro. */
const STATUS_FILTER_COUNT_KEYS = Object.freeze({
  all: 'total',
  ready: 'ready',
  done: 'done',
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
  // Búsqueda por DNI con más de una credencial (entrenador, o entrada +
  // inscripción): no es un veredicto, es "elegí cuál".
  multiple_matches: { Icon: HelpCircle, tone: 'warning' },
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
  const { t } = useI18n()
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
  const [highlightRowId, setHighlightRowId] = useState(null)
  const [scanHistory, setScanHistory] = useState([])
  const [activeHistoryId, setActiveHistoryId] = useState(null)
  const [feedbackPrefs, setFeedbackPrefs] = useState(readFeedbackPrefs)
  const [redeemBusyId, setRedeemBusyId] = useState(null)
  const [redeemError, setRedeemError] = useState('')
  const [allowlistSources, setAllowlistSources] = useState(null)
  const offlineSync = useOfflineCheckinSync(eventSlug)
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

  // Con varias puertas abiertas los contadores sólo se movían con los ingresos
  // de ESTE equipo. Se vuelven a pedir cada tanto, y sólo con la pestaña a la
  // vista y con conexión: de fondo o sin señal sería gasto sin nadie mirando.
  const [allowlistReloadKey, setAllowlistReloadKey] = useState(0)
  const allowlistRefreshedAtRef = useRef(0)
  const allowlistTrailingRef = useRef(null)

  useEffect(
    () => () => {
      if (allowlistTrailingRef.current) window.clearTimeout(allowlistTrailingRef.current)
    },
    [],
  )

  // Un ingreso en otra puerta, una entrada cancelada o aprobada, una invitación
  // nueva: la base avisa por `ticket-ops:<slug>` (sin datos) y acá se relee.
  // Si este puesto tiene la lista offline bajada, también se refresca, así una
  // cancelación llega a la puerta que después se quede sin señal.
  const refreshAllowlists = useCallback(() => {
    allowlistRefreshedAtRef.current = Date.now()
    if ((registrations?.length ?? 0) === 0) setAllowlistReloadKey((key) => key + 1)
    if (offlineSync.lastDownloadedAt && navigator.onLine) {
      void offlineSync.downloadAllowlist().catch(() => {})
    }
  }, [offlineSync, registrations])
  // El timeout de la relectura final tiene que usar el estado del momento en
  // que corre (lista offline bajada o no), no el de cuando se programó.
  const refreshAllowlistsRef = useRef(refreshAllowlists)
  refreshAllowlistsRef.current = refreshAllowlists

  const handleOpsChange = useCallback(() => {
    if (!eventSlug) return
    // Lo liviano (contadores y entradas) en cada ventana de avisos.
    onRefreshTickets?.(eventSlug)
    // Lo pesado (la lista completa), como mucho cada 20 s; si cae dentro de la
    // ventana, queda una relectura al final para no perder el último cambio
    // (una cancelación tiene que llegar a la lista offline).
    const elapsed = Date.now() - allowlistRefreshedAtRef.current
    if (elapsed >= ALLOWLIST_REFRESH_MIN_MS) {
      refreshAllowlists()
    } else if (!allowlistTrailingRef.current) {
      allowlistTrailingRef.current = window.setTimeout(() => {
        allowlistTrailingRef.current = null
        refreshAllowlistsRef.current()
      }, ALLOWLIST_REFRESH_MIN_MS - elapsed)
    }
  }, [eventSlug, onRefreshTickets, refreshAllowlists])

  const opsRealtime = useBroadcastTopic(
    eventSlug ? `ticket-ops:${eventSlug}` : null,
    OPS_EVENTS,
    handleOpsChange,
    OPS_REALTIME_OPTIONS,
  )

  useEffect(() => {
    if (!eventSlug || !onRefreshTickets) return undefined
    const intervalId = window.setInterval(
      () => {
        if (document.visibilityState !== 'visible' || !navigator.onLine) return
        onRefreshTickets(eventSlug)
      },
      opsRealtime.connected ? COUNTER_REFRESH_LIVE_MS : COUNTER_REFRESH_MS,
    )
    return () => window.clearInterval(intervalId)
  }, [eventSlug, onRefreshTickets, opsRealtime.connected])

  useEffect(() => {
    if ((registrations?.length ?? 0) > 0 || !eventSlug) return undefined
    let live = true
    getEventCheckinAllowlist(eventSlug)
      .then((data) => {
        if (live) setAllowlistSources(mapAllowlistToCheckinSources(data, eventSlug))
      })
      .catch(() => {
        // Si la relectura falla se conserva lo último que se vio (no se pisa
        // con null): vaciar la lista por un corte momentáneo dejaría la puerta
        // sin nadie a quien buscar.
      })
    return () => {
      live = false
    }
  }, [allowlistReloadKey, eventSlug, registrations])

  const allRows = useMemo(
    () =>
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
    [allowlistSources, athletes, eventSlug, payments, registrations, ticketTypes, tickets],
  )

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
        .filter(([value]) => value !== 'to_validate' || filteredScopeCounts.toValidate > 0)
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

  const runParsedScan = useCallback(
    async (parsed, raw) => {
      const scanSeq = ++scanSeqRef.current
      const isStale = () => scanSeq !== scanSeqRef.current
      setScanBusy(true)
      setScanResult(null)

      try {
        // `staff` pide la proyección con documento: el workspace solo se
        // renderiza detrás de admin.checkin.execute, que es el mismo permiso
        // que exige el endpoint.
        const resolved = await resolveCredentialScan(parsed, {
          defaultEventSlug: eventSlug,
          staff: canCheckIn,
          zoneScope,
        })
        if (isStale()) return
        const historyEntry = buildHistoryEntry(resolved, raw)
        setScanResult(resolved)
        setRedeemError('')
        prependHistoryEntry(historyEntry)
        playCheckinFeedback(resolved.outcome ?? 'invalid', feedbackPrefs)
        if (resolved.row?.id) {
          setHighlightRowId(resolved.row.id)
        }
        reportScanAttempt({
          eventSlug,
          kind: resolved.kind ?? 'unknown',
          outcome: resolved.outcome ?? 'invalid',
          qrToken: resolved.qrToken ?? null,
        })
      } catch (error) {
        if (isStale()) return
        const failure = classifyCheckinFailure(error)

        if (isRetryableCheckinFailure(error)) {
          // Sin red, 429 o 5xx: se valida contra la lista descargada. Si no hay
          // lista, se dice que el servicio no contestó en vez de acusar al QR.
          const found = await findInAllowlist(eventSlug, parsed.code)
          if (isStale()) return
          const offlineResult = found
            ? buildOfflineScanResult(found, zoneScope)
            : { outcome: 'service_unavailable', offline: true }
          setScanResult(offlineResult)
          setRedeemError('')
          prependHistoryEntry(buildHistoryEntry(offlineResult, raw))
          playCheckinFeedback(offlineResult.outcome ?? 'invalid', feedbackPrefs)
          if (offlineResult.row?.id) setHighlightRowId(offlineResult.row.id)
          reportScanAttempt({
            eventSlug,
            kind: offlineResult.kind ?? 'unknown',
            outcome: offlineResult.outcome ?? 'invalid',
            qrToken: offlineResult.qrToken ?? null,
            offline: true,
          })
          setScanBusy(false)
          return
        }

        console.error('checkin scan:', error)
        const failedOutcome = failure === 'auth' ? 'session_expired' : 'not_found'
        const failedResult = { outcome: failedOutcome }
        setScanResult(failedResult)
        prependHistoryEntry(buildHistoryEntry(failedResult, raw))
        playCheckinFeedback(failedOutcome, feedbackPrefs)
        // Una sesión vencida no es un intento sobre ese QR: no ensucia el reporte.
        if (failure !== 'auth') {
          reportScanAttempt({ eventSlug, kind: 'unknown', outcome: 'not_found' })
        }
      } finally {
        if (!isStale()) setScanBusy(false)
      }
    },
    [canCheckIn, eventSlug, feedbackPrefs, zoneScope],
  )

  /**
   * Muestra un resultado que no salió de resolver un QR (búsqueda manual sin
   * coincidencias, varias coincidencias, sesión vencida): mismo historial y
   * misma alerta que un escaneo.
   */
  const showScanOutcome = useCallback(
    (result, raw) => {
      setScanResult(result)
      setRedeemError('')
      const entry = buildHistoryEntry(result, raw)
      setScanHistory((current) => [entry, ...current].slice(0, MAX_SCAN_HISTORY))
      setActiveHistoryId(entry.id)
      playCheckinFeedback(result.outcome ?? 'invalid', feedbackPrefs)
    },
    [feedbackPrefs],
  )

  /**
   * El guardia eligió una credencial (o la búsqueda dio una sola). Online sigue
   * por el carril del escaneo con el token que hubiera traído el QR: pago,
   * vigencia, zona y uso único se validan igual que con la cámara. Offline se
   * valida contra la lista descargada, como un QR sin señal.
   */
  const selectScanMatch = useCallback(
    async (match, raw = match?.ticketCode ?? match?.document ?? '') => {
      if (!match?.code) return
      if (match.entry) {
        const offlineResult = buildOfflineScanResult(
          { kind: match.kind, entry: match.entry },
          zoneScope,
        )
        showScanOutcome(offlineResult, raw)
        if (offlineResult.row?.id) setHighlightRowId(offlineResult.row.id)
        reportScanAttempt({
          eventSlug,
          kind: offlineResult.kind ?? 'unknown',
          outcome: offlineResult.outcome ?? 'invalid',
          qrToken: offlineResult.qrToken ?? null,
          offline: true,
        })
        return
      }
      await runParsedScan(
        { code: match.code, eventSlug, type: match.kind === 'ticket' ? 'ticket' : null },
        raw,
      )
    },
    [eventSlug, runParsedScan, showScanOutcome, zoneScope],
  )

  /**
   * "El QR no escanea": número impreso en la entrada o DNI -> credencial(es)
   * de este evento. Una sola sigue directo; varias se le muestran al guardia
   * para que elija; ninguna es "no encontrada", con la pista de qué se buscó.
   */
  const runManualLookup = useCallback(
    async (manual, raw) => {
      const scanSeq = ++scanSeqRef.current
      const isStale = () => scanSeq !== scanSeqRef.current
      const query = checkinLookupQuery(manual)
      setScanBusy(true)
      setScanResult(null)

      try {
        let matches
        try {
          matches = await lookupCheckinCredentials(eventSlug, query)
        } catch (error) {
          if (isStale()) return
          if (classifyCheckinFailure(error) === 'auth') {
            showScanOutcome({ outcome: 'session_expired' }, raw)
            return
          }
          if (!isRetryableCheckinFailure(error)) throw error
          // Sin red: la misma búsqueda contra la lista descargada.
          matches = await findMatchesInAllowlist(eventSlug, query)
          if (isStale()) return
          if (!matches) {
            showScanOutcome({ outcome: 'service_unavailable', offline: true }, raw)
            return
          }
        }
        if (isStale()) return

        if (matches.length === 1) {
          await selectScanMatch(matches[0], raw)
          return
        }
        if (matches.length === 0) {
          showScanOutcome({ outcome: 'not_found', manualQuery: manual }, raw)
          reportScanAttempt({ eventSlug, kind: 'unknown', outcome: 'not_found' })
          return
        }
        showScanOutcome({ outcome: 'multiple_matches', matches, manualQuery: manual }, raw)
      } catch (error) {
        if (isStale()) return
        console.error('checkin manual lookup:', error)
        showScanOutcome({ outcome: 'not_found', manualQuery: manual }, raw)
      } finally {
        if (!isStale()) setScanBusy(false)
      }
    },
    [eventSlug, selectScanMatch, showScanOutcome],
  )

  const handleScan = useCallback(
    async (raw) => {
      const manual = parseManualCheckinCode(raw)
      if (needsCheckinLookup(manual)) {
        await runManualLookup(manual, raw)
        return
      }

      const parsed = parseCredentialScan(raw)
      if (!parsed?.code) {
        const invalidResult = { outcome: 'invalid' }
        setScanResult(invalidResult)
        prependHistoryEntry(buildHistoryEntry(invalidResult, raw))
        playCheckinFeedback('invalid', feedbackPrefs)
        reportScanAttempt({ eventSlug, kind: 'unknown', outcome: 'invalid' })
        return
      }
      await runParsedScan(parsed, raw)
    },
    [eventSlug, feedbackPrefs, runManualLookup, runParsedScan],
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
    selectScanMatch,
    highlightRowId,
    offlineSync,
    realtimeConnected: opsRealtime.connected,
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
