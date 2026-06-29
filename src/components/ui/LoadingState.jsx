import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function LoadingState({ label }) {
  const { t } = useI18n()

  return (
    <div className="state-card state-card--loading" role="status" aria-live="polite">
      <div className="state-card__spinner" aria-hidden />
      <p>{label ?? t('common.loading')}</p>
    </div>
  )
}
