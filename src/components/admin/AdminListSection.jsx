import AdminFilterBar from './AdminFilterBar.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatRecordCount } from '../../i18n/adminHelpers.js'

export default function AdminListSection({
  actions,
  children,
  filteredCount,
  filters = [],
  onQueryChange,
  placeholder,
  query,
  stats = [],
  subtitle,
  title,
  totalCount,
}) {
  const { t } = useI18n()
  const resultLabel = formatRecordCount(t, filteredCount, totalCount)
  const searchPlaceholder = placeholder ?? t('admin.search.default')

  return (
    <div className="admin-list-section">
      <section className="admin-list-shell surface-card surface-card--flat">
        <header className="admin-list-shell__header">
          <div className="admin-list-shell__intro">
            <h1 className="admin-list-shell__title">{title}</h1>
            {subtitle && <p className="admin-list-shell__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="admin-list-shell__actions">{actions}</div>}
        </header>

        {(stats.length > 0 || totalCount != null) && (
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

        <AdminFilterBar
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
