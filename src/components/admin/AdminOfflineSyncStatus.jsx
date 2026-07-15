import { useState } from 'react'
import { CloudOff, Download, RefreshCw, Wifi } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

function formatTime(iso) {
  if (!iso) return null
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
}

/**
 * AdminOfflineSyncStatus — PLU ARG
 *
 * Pill de estado para el scanner de seguridad: conectividad, cola de
 * check-ins pendientes de sincronizar, y acceso a descargar la allow-list
 * offline del evento activo (ver useOfflineCheckinSync.js).
 */
export default function AdminOfflineSyncStatus({
  conflictCount,
  downloadAllowlist,
  isOnline,
  lastDownloadedAt,
  lastSyncedAt,
  pendingCount,
  syncNow,
  syncing,
}) {
  const { t } = useI18n()
  const [downloading, setDownloading] = useState(false)
  const [showConflicts, setShowConflicts] = useState(false)

  async function handleDownload() {
    setDownloading(true)
    try {
      await downloadAllowlist()
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className={`admin-offline-sync-status admin-offline-sync-status--${isOnline ? 'online' : 'offline'}`}>
      <div className="admin-offline-sync-status__row">
        <span className="admin-offline-sync-status__badge">
          {isOnline ? <Wifi size={14} aria-hidden /> : <CloudOff size={14} aria-hidden />}
          {isOnline ? t('admin.checkin.offline.online') : t('admin.checkin.offline.offline')}
        </span>

        {pendingCount > 0 && (
          <span className="admin-offline-sync-status__pending">
            {t('admin.checkin.offline.pending', { count: pendingCount })}
          </span>
        )}

        {pendingCount > 0 && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={syncNow} disabled={syncing || !isOnline}>
            <RefreshCw size={14} aria-hidden />
            {syncing ? t('admin.checkin.offline.syncing') : t('admin.checkin.offline.syncNow')}
          </button>
        )}

        <button type="button" className="btn btn--ghost btn--sm" onClick={handleDownload} disabled={downloading}>
          <Download size={14} aria-hidden />
          {downloading ? t('admin.checkin.offline.downloading') : t('admin.checkin.offline.downloadAllowlist')}
        </button>
      </div>

      <p className="admin-offline-sync-status__meta">
        {lastDownloadedAt
          ? t('admin.checkin.offline.lastDownloaded', { time: formatTime(lastDownloadedAt) })
          : t('admin.checkin.offline.neverDownloaded')}
        {lastSyncedAt && ` · ${formatTime(lastSyncedAt)}`}
      </p>

      {conflictCount > 0 && (
        <button
          type="button"
          className="admin-offline-sync-status__conflicts-toggle"
          onClick={() => setShowConflicts((current) => !current)}
        >
          {t('admin.checkin.offline.conflictsTitle')} ({conflictCount})
        </button>
      )}

      {showConflicts && conflictCount > 0 && (
        <p className="admin-offline-sync-status__meta admin-offline-sync-status__meta--warning">
          {t('admin.checkin.offline.conflictsHint')}
        </p>
      )}
    </div>
  )
}
