import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * Skeleton de tabla operativa: anticipa la geometría de AdminDataTable
 * (cabecera + filas separadas por hairline) para que la primera carga no
 * se lea como "sin resultados". El shimmer es un único barrido por fila,
 * desacoplado (stagger corto), y desaparece bajo reduced motion.
 */
export default function TableSkeleton({ rows = 6, columns = 5, label }) {
  const { t } = useI18n()
  const statusLabel = label ?? t('common.loading')

  return (
    <div className="table-skeleton" role="status" aria-live="polite" aria-busy="true">
      <p className="visually-hidden">{statusLabel}</p>
      <div className="table-skeleton__frame" aria-hidden="true">
        <div className="table-skeleton__head" style={{ '--skeleton-cols': columns }}>
          {Array.from({ length: columns }, (_, index) => (
            <span key={index} className="table-skeleton__label" />
          ))}
        </div>
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div
            key={rowIndex}
            className="table-skeleton__row"
            style={{ '--skeleton-cols': columns, '--skeleton-stagger': `${rowIndex * 70}ms` }}
          >
            {Array.from({ length: columns }, (_, columnIndex) => (
              <span key={columnIndex} className="table-skeleton__cell" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
