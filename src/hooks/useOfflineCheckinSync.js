import { useCallback, useEffect, useRef, useState } from 'react'
import { listPending, listResolvedConflicts } from '../lib/offlineCheckinDb.js'
import { downloadAllowlist as downloadAllowlistRequest, syncPendingCheckins } from '../services/offlineCheckinSync.js'

const SYNC_INTERVAL_MS = 25000

/**
 * useOfflineCheckinSync — PLU ARG
 *
 * Estado de conectividad + cola offline para el scanner de seguridad
 * (CheckInSection.jsx). Sincroniza automáticamente al reconectar y cada
 * ~25s mientras haya pendientes, sin bloquear la fila de entrada al evento.
 */
export function useOfflineCheckinSync(eventSlug) {
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [conflictCount, setConflictCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState(null)
  const [lastDownloadedAt, setLastDownloadedAt] = useState(null)
  const syncingRef = useRef(false)

  const refreshCounts = useCallback(async () => {
    const [pending, conflicts] = await Promise.all([listPending(), listResolvedConflicts()])
    setPendingCount(pending.length)
    setConflictCount(conflicts.length)
  }, [])

  const syncNow = useCallback(async () => {
    if (syncingRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) return
    syncingRef.current = true
    setSyncing(true)
    try {
      await syncPendingCheckins()
      setLastSyncedAt(new Date().toISOString())
    } finally {
      syncingRef.current = false
      setSyncing(false)
      await refreshCounts()
    }
  }, [refreshCounts])

  const downloadAllowlist = useCallback(async () => {
    if (!eventSlug) return
    const data = await downloadAllowlistRequest(eventSlug)
    setLastDownloadedAt(data.downloadedAt)
  }, [eventSlug])

  useEffect(() => {
    refreshCounts()
  }, [refreshCounts])

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
    }, SYNC_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [syncNow])

  return {
    isOnline,
    pendingCount,
    conflictCount,
    syncing,
    lastSyncedAt,
    lastDownloadedAt,
    syncNow,
    downloadAllowlist,
    refreshCounts,
  }
}
