import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

// Debe casar con la duración del fade-out de `admin-live-sync--settled`
// (states del panel, admin.css): el chip se desmonta cuando ya está invisible.
const SETTLE_MS = 2600

/**
 * Aviso de sincronización en background del panel. Dos momentos, un solo
 * acento (oro): punto pulsante mientras sincroniza y un check estático que
 * confirma y se desvanece al settle. El flag `refreshing` ya llega diferido
 * por useAppData (solo si el refetch supera el umbral), así que un polling
 * sano no parpadea cada 15 segundos.
 */
export default function AdminLiveSyncBadge({ refreshing = false, syncedAt = null }) {
  const { t } = useI18n()
  const [settledRecently, setSettledRecently] = useState(false)

  useEffect(() => {
    if (!syncedAt) return undefined
    setSettledRecently(true)
    const timerId = window.setTimeout(() => setSettledRecently(false), SETTLE_MS)
    return () => window.clearTimeout(timerId)
  }, [syncedAt])

  if (!refreshing && !settledRecently) return null

  const settled = !refreshing

  return (
    <div
      className={`admin-live-sync${settled ? ' admin-live-sync--settled' : ''}`}
      role="status"
      aria-live="polite"
    >
      {settled ? (
        <Check size={12} strokeWidth={2.5} className="admin-live-sync__check" aria-hidden="true" />
      ) : (
        <span className="admin-live-sync__dot" aria-hidden="true" />
      )}
      {settled ? t('admin.shell.updated') : t('admin.shell.syncing')}
    </div>
  )
}
