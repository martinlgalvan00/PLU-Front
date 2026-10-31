import { useCallback, useEffect, useRef, useState } from 'react'
import { CHECKIN_SYNC } from '../lib/checkinSyncConfig.js'
import {
  getAllowlist,
  listDoorSyncStatus,
  listPending,
  listResolvedConflicts,
} from '../lib/offlineCheckinDb.js'
import {
  downloadAllowlist as downloadAllowlistRequest,
  syncPendingCheckins,
} from '../services/offlineCheckinSync.js'
import { syncPendingScanEvents } from '../services/checkinTelemetry.js'

/**
 * useOfflineCheckinSync — PLU ARG
 *
 * Estado de conectividad + cola offline para el scanner de seguridad
 * (CheckInSection.jsx). Sincroniza automáticamente al reconectar y cada
 * ~25s mientras haya pendientes, sin bloquear la fila de entrada al evento.
 */
export function useOfflineCheckinSync(eventSlug) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const [pendingCount, setPendingCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)
  const [conflictCount, setConflictCount] = useState(0)
  const [queueLog, setQueueLog] = useState([])
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState(null)
  const [lastDownloadedAt, setLastDownloadedAt] = useState(null)
  // 'auth' = la sesión del puesto venció con ingresos todavía en la cola.
  const [syncIssue, setSyncIssue] = useState(null)
  const syncingRef = useRef(false)

  const refreshCounts = useCallback(async () => {
    const [pending, conflicts, log] = await Promise.all([
      listPending(),
      listResolvedConflicts(),
      listDoorSyncStatus(),
    ])
    setPendingCount(pending.filter((item) => item.status !== 'exhausted').length)
    setFailedCount(pending.filter((item) => item.status === 'exhausted').length)
    setConflictCount(conflicts.length)
    setQueueLog(log)
  }, [])

  const noteSnapshot = useCallback((downloadedAt) => {
    if (downloadedAt) setLastDownloadedAt(downloadedAt)
  }, [])

  const syncNow = useCallback(async () => {
    if (syncingRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) return
    syncingRef.current = true
    setSyncing(true)
    try {
      const results = await syncPendingCheckins()
      setSyncIssue(results.some((item) => item.outcome === 'auth') ? 'auth' : null)
      // Best-effort y aparte del check-in real: si la telemetría falla, no
      // puede tumbar la sincronización de ingresos que sí importan.
      if (eventSlug) await syncPendingScanEvents(eventSlug).catch(() => {})
      setLastSyncedAt(new Date().toISOString())
    } finally {
      syncingRef.current = false
      setSyncing(false)
      await refreshCounts()
    }
  }, [eventSlug, refreshCounts])

  const downloadAllowlist = useCallback(async () => {
    if (!eventSlug) return null
    const data = await downloadAllowlistRequest(eventSlug)
    if (data?.downloadedAt) setLastDownloadedAt(data.downloadedAt)
    return data
  }, [eventSlug])

  const reloadAndSync = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return null
    let data = null
    try {
      data = await downloadAllowlist()
    } catch {
      data = null
    }
    await syncNow()
    return data
  }, [downloadAllowlist, syncNow])

  useEffect(() => {
    refreshCounts()
  }, [refreshCounts])

  useEffect(() => {
    if (!eventSlug) return undefined
    let live = true
    getAllowlist(eventSlug)
      .then((data) => {
        if (live && data?.downloadedAt) setLastDownloadedAt(data.downloadedAt)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [eventSlug])

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
      syncNow()
    }
    function handleOffline() {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [syncNow])

  useEffect(() => {
    const interval = setInterval(() => {
      if (navigator.onLine) syncNow()
    }, CHECKIN_SYNC.intervalMs)
    return () => clearInterval(interval)
  }, [syncNow])

  return {
    isOnline,
    pendingCount,
    failedCount,
    conflictCount,
    queueLog,
    syncing,
    syncIssue,
    lastSyncedAt,
    lastDownloadedAt,
    syncNow,
    downloadAllowlist,
    reloadAndSync,
    refreshCounts,
    noteSnapshot,
  }
}
