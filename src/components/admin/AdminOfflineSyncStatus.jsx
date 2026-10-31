import { useEffect, useState } from 'react'
import { CloudOff, Download, RefreshCw, Wifi } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

function formatTime(iso) {
  if (!iso) return null
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  )
}

/**
 * AdminOfflineSyncStatus — PLU ARG
 *
 * Barra compacta de estado para el scanner: conectividad, cola pendiente,
 * y descarga de la allow-list offline del evento activo.
 */
export default function AdminOfflineSyncStatus({
  compact = false,
  conflictCount,
  downloadAllowlist,
  failedCount = 0,
  isOnline,
  lastDownloadedAt,
  lastSyncedAt,
  onReloadAndSync = null,
  pendingCount,
  queueLog = [],
  syncIssue = null,
  syncNow,
  syncing,
  workList = false,
}) {
  const { t } = useI18n()
  const [downloading, setDownloading] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [showConflicts, setShowConflicts] = useState(false)
  const [showQueue, setShowQueue] = useState(pendingCount > 0)
  const queueOpen = workList || showQueue

  useEffect(() => {
    if (pendingCount > 0) setShowQueue(true)
  }, [pendingCount])

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

  async function handleReloadAndSync() {
    if (!onReloadAndSync || !isOnline) return
    setReloading(true)
    try {
      await onReloadAndSync()
    } finally {
      setReloading(false)
    }
  }

  function queueStatusKey(item) {
    if (syncIssue === 'auth' && item.status === 'pending') return 'session'
    return item.status
  }

  const statusClass = [
    'admin-offline-sync-status',
    `admin-offline-sync-status--${isOnline ? 'online' : 'offline'}`,
    compact ? 'admin-offline-sync-status--compact' : '',
    needsDownload ? 'admin-offline-sync-status--setup' : '',
    hasPending ? 'admin-offline-sync-status--pending' : '',
    workList ? 'admin-offline-sync-status--worklist' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const metaText = needsDownload
    ? t('admin.checkin.offline.neverDownloaded')
    : [
        t('admin.checkin.offline.lastDownloaded', { time: formatTime(lastDownloadedAt) }),
        lastSyncedAt
          ? t('admin.checkin.offline.lastSynced', { time: formatTime(lastSyncedAt) })
          : null,
      ]
        .filter(Boolean)
        .join(' · ')

  return (
    <div className={statusClass}>
      <div className="admin-offline-sync-status__main">
        <div className="admin-offline-sync-status__identity">
          <div className="admin-offline-sync-status__status-row">
            <span className="admin-offline-sync-status__badge">
              {isOnline ? <Wifi size={14} aria-hidden /> : <CloudOff size={14} aria-hidden />}
              {isOnline ? t('admin.checkin.offline.online') : t('admin.checkin.offline.offline')}
            </span>

            {hasPending && (
              <span className="admin-offline-sync-status__pending">
                {t('admin.checkin.offline.pending', { count: pendingCount })}
              </span>
            )}
          </div>

          <p className="admin-offline-sync-status__title">
            {needsDownload
              ? t('admin.checkin.offline.setupTitle')
              : t('admin.checkin.offline.readyTitle')}
          </p>
          <p className="admin-offline-sync-status__meta">{metaText}</p>
        </div>

        <div className="admin-offline-sync-status__actions">
          {onReloadAndSync ? (
            <button
              type="button"
              className="btn btn--small"
              onClick={handleReloadAndSync}
              disabled={reloading || syncing || !isOnline}
            >
              <RefreshCw size={14} aria-hidden />
              {reloading || syncing
                ? t('admin.checkin.offline.reloading')
                : t('admin.checkin.offline.reloadAndSync')}
            </button>
          ) : null}

          {hasPending && !onReloadAndSync ? (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={syncNow}
              disabled={syncing || !isOnline}
            >
              <RefreshCw size={14} aria-hidden />
              {syncing ? t('admin.checkin.offline.syncing') : t('admin.checkin.offline.syncNow')}
            </button>
          ) : null}

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

      {!isOnline && !needsDownload ? (
        <p className="admin-offline-sync-status__meta admin-offline-sync-status__meta--warning" role="status">
          {t('admin.checkin.offline.savedOnDevice')}
        </p>
      ) : null}

      {isOnline && hasPending ? (
        <p className="admin-offline-sync-status__meta admin-offline-sync-status__meta--warning" role="status">
          {syncing
            ? t('admin.checkin.offline.sendingNow')
            : t('admin.checkin.offline.waitingToSend')}
        </p>
      ) : null}

      {queueLog.length > 0 && !workList ? (
        <button
          type="button"
          className="admin-offline-sync-status__conflicts-toggle"
          aria-expanded={showQueue}
          onClick={() => setShowQueue((current) => !current)}
        >
          {t('admin.checkin.offline.queueTitle', { count: queueLog.length })}
        </button>
      ) : null}

      {workList && queueLog.length > 0 ? (
        <p className="admin-offline-sync-status__queue-title">
          {t('admin.checkin.offline.queueTitle', { count: queueLog.length })}
        </p>
      ) : null}

      {queueOpen && queueLog.length > 0 ? (
        <ul className="admin-offline-sync-status__queue">
          {queueLog.map((item) => {
            const when = formatTime(item.at)
            const detail = [item.gate, when].filter(Boolean).join(' · ')
            return (
              <li key={item.localId} className="admin-offline-sync-status__queue-item">
                <span className="admin-offline-sync-status__queue-label">{item.label}</span>
                <span>{t(`admin.checkin.offline.queueStatus.${queueStatusKey(item)}`)}</span>
                {detail ? (
                  <span className="admin-offline-sync-status__queue-meta">{detail}</span>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}

      {failedCount > 0 ? (
        <p
          className="admin-offline-sync-status__meta admin-offline-sync-status__meta--warning"
          role="alert"
        >
          {t('admin.checkin.offline.exhausted', { count: failedCount })}
        </p>
      ) : null}

      {syncIssue === 'auth' && hasPending ? (
        <p
          className="admin-offline-sync-status__meta admin-offline-sync-status__meta--warning"
          role="alert"
        >
          {t('admin.checkin.offline.sessionExpired', { count: pendingCount })}
        </p>
      ) : null}

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
