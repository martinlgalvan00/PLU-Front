import AdminFilterBar from './AdminFilterBar.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatRecordCount } from '../../i18n/adminHelpers.js'

export default function AdminListSection({
  actions,
  beforeFilters,
  children,
  filteredCount,
  filters = [],
  meta,
  onQueryChange,
  placeholder,
  query,
  showHeader = true,
  showStats = true,
  stats = [],
  subtitle,
  title,
  totalCount,
  variant,
  eyebrow,
}) {
  const { t } = useI18n()
  const resultLabel = formatRecordCount(t, filteredCount, totalCount)
  const searchPlaceholder = placeholder ?? t('admin.search.default')
  const shellClass = [
    'admin-list-shell surface-card surface-card--flat',
    variant ? `admin-list-shell--${variant}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const showStatsStrip = showStats && (stats.length > 0 || totalCount != null)

  return (
    <div className={`admin-list-section${variant ? ` admin-list-section--${variant}` : ''}`}>
      <section className={shellClass}>
        {showHeader && (
          <header className="admin-list-shell__header">
            <div className="admin-list-shell__intro">
              {eyebrow ? <span className="admin-list-shell__eyebrow">{eyebrow}</span> : null}
              {title && <h1 className="admin-list-shell__title">{title}</h1>}
              {subtitle && <p className="admin-list-shell__subtitle">{subtitle}</p>}
              {meta && (
                <span className="admin-list-shell__meta" aria-live="polite">
                  {meta}
                </span>
              )}
            </div>
            {actions && <div className="admin-list-shell__actions">{actions}</div>}
          </header>
        )}

        {!showHeader && (actions || meta) && (
          <div className="admin-list-shell__toolbar">
            {meta && (
              <span className="admin-list-shell__meta" aria-live="polite">
                {meta}
              </span>
            )}
            {actions && <div className="admin-list-shell__actions">{actions}</div>}
          </div>
        )}

        {showStatsStrip && (
          <div className="admin-list-shell__stats-strip" aria-label={t('admin.summary.aria')}>
            {stats.map(({ label, tone = 'default', value }) => (
              <article key={label} className={`admin-list-stat admin-list-stat--${tone}`}>
                <strong>{value}</strong>
                <span>{label}</span>
              </article>
            ))}
            <div className="admin-list-shell__count-wrap">
              <span className="admin-list-shell__count" aria-live="polite">
                {resultLabel}
              </span>
            </div>
          </div>
        )}

        {beforeFilters}

        <AdminFilterBar
          className={variant ? `admin-filters--${variant}` : ''}
          compact
          inline
          filters={filters}
          placeholder={searchPlaceholder}
          query={query}
          onQueryChange={onQueryChange}
        />

        <div className="admin-list-shell__body">{children}</div>
      </section>
    </div>
  )
}
