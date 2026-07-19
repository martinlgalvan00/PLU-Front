import { RefreshCw, ServerOff } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function AdminApiConnectionNotice({ error, onRetry, retrying = false }) {
  const { t } = useI18n()
  const networkError = error?.status === 0

  return (
    <div className="admin-api-notice" role="alert">
      <span className="admin-api-notice__icon"><ServerOff size={17} aria-hidden /></span>
      <div>
        <strong>
          {networkError
            ? t('admin.eventEditor.security.apiUnavailableTitle')
            : t('admin.eventEditor.security.errorLoad')}
        </strong>
        <p>
          {networkError
            ? t('admin.eventEditor.security.apiUnavailableLead')
            : error?.message ?? t('admin.eventEditor.security.errorLoad')}
        </p>
        {networkError && import.meta.env.DEV && (
          <small>{t('admin.eventEditor.security.apiUnavailableDev')}</small>
        )}
      </div>
      <button type="button" onClick={onRetry} disabled={retrying}>
        <RefreshCw size={13} aria-hidden />
        {retrying ? t('admin.eventEditor.security.retrying') : t('admin.eventEditor.security.retry')}
      </button>
    </div>
  )
}
