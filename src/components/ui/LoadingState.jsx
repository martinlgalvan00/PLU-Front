import { useI18n } from '../../i18n/I18nProvider.jsx'

const MARK = 'PLU'

/**
 * Estado de carga editorial. `variant="page"` cubre el fallback de sección
 * (Suspense); el default es el bloque inline de datos.
 */
export default function LoadingState({ label, variant = 'inline' }) {
  const { t } = useI18n()
  const statusLabel = label ?? t('common.loading')
  const isPage = variant === 'page'

  return (
    <div
      className={isPage ? 'page-load-fallback loading-state loading-state--page' : 'loading-state'}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="loading-state__mark" aria-hidden="true">
        {MARK}
      </p>
      <span className="loading-state__rail" aria-hidden="true">
        <span className="loading-state__rule" />
      </span>
      <p className={isPage ? 'visually-hidden' : 'loading-state__label'}>{statusLabel}</p>
    </div>
  )
}
