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
 * Barra compacta de estado para el scanner: conectividad, cola pendiente,
 * y descarga de la allow-list offline del evento activo.
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

  const needsDownload = !lastDownloadedAt
  const hasPending = pendingCount > 0

  async function handleDownload() {
    setDownloading(true)
    try {
      await downloadAllowlist()
    } finally {
      setDownloading(false)
    }
  }

  const statusClass = [
    'admin-offline-sync-status',
    `admin-offline-sync-status--${isOnline ? 'online' : 'offline'}`,
    needsDownload ? 'admin-offline-sync-status--setup' : '',
    hasPending ? 'admin-offline-sync-status--pending' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const metaText = needsDownload
    ? t('admin.checkin.offline.neverDownloaded')
    : [
        t('admin.checkin.offline.lastDownloaded', { time: formatTime(lastDownloadedAt) }),
        lastSyncedAt ? t('admin.checkin.offline.lastSynced', { time: formatTime(lastSyncedAt) }) : null,
      ]
        .filter(Boolean)
        .join(' · ')

  return (
    <div className={statusClass}>
      <div className="admin-offline-sync-status__main">
        <div className="admin-offline-sync-status__identity">
          <span className="admin-offline-sync-status__badge">
            {isOnline ? <Wifi size={14} aria-hidden /> : <CloudOff size={14} aria-hidden />}
            {isOnline ? t('admin.checkin.offline.online') : t('admin.checkin.offline.offline')}
          </span>

          {hasPending && (
            <span className="admin-offline-sync-status__pending">
              {t('admin.checkin.offline.pending', { count: pendingCount })}
            </span>
          )}

          <p className="admin-offline-sync-status__meta">{metaText}</p>
        </div>

        <div className="admin-offline-sync-status__actions">
          {hasPending && (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={syncNow}
              disabled={syncing || !isOnline}
            >
              <RefreshCw size={14} aria-hidden />
              {syncing ? t('admin.checkin.offline.syncing') : t('admin.checkin.offline.syncNow')}
            </button>
          )}

          <button
            type="button"
            className={`btn btn--small${needsDownload ? '' : ' btn--ghost'}`}
            onClick={handleDownload}
            disabled={downloading}
          >
            <Download size={14} aria-hidden />
            {downloading
              ? t('admin.checkin.offline.downloading')
              : needsDownload
                ? t('admin.checkin.offline.downloadAllowlist')
                : t('admin.checkin.offline.refreshAllowlist')}
          </button>
        </div>
      </div>

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
