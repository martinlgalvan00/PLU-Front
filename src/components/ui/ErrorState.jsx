import { AlertTriangle } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function ErrorState({
  title,
  message,
  onRetry,
  retryLabel,
}) {
  const { t } = useI18n()

  return (
    <div className="state-card state-card--error" role="alert">
      <AlertTriangle size={28} />
      <h3>{title ?? t('common.errorTitle')}</h3>
      <p>{message ?? t('common.errorMessage')}</p>
      {onRetry && (
        <button type="button" className="btn btn--small" onClick={onRetry}>
          {retryLabel ?? t('common.retry')}
        </button>
      )}
    </div>
  )
}
