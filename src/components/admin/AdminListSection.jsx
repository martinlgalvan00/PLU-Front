import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import AdminFilterBar from './AdminFilterBar.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatRecordCount } from '../../i18n/adminHelpers.js'

const COMPACT_STATS_MQ = '(max-width: 1100px)'

function useIsNarrow(query = COMPACT_STATS_MQ) {
  const [isNarrow, setIsNarrow] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    const media = window.matchMedia(query)
    function sync(event) {
      setIsNarrow(event.matches)
    }
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [query])

  return isNarrow
}

export default function AdminListSection({
  actions,
  beforeFilters,
  children,
  filteredCount,
  filterActions = null,
  filters = [],
  meta,
  onQueryChange,
  placeholder,
  query,
  showHeader = true,
  showStats = true,
  showFilters = true,
  stats = [],
  subtitle,
  title,
  totalCount,
  variant,
  eyebrow,
  /** En viewports ≤1100px el resumen arranca colapsado (mobile + notebook). */
  collapseStatsOnMobile = true,
}) {
  const { t } = useI18n()
  const resultLabel = formatRecordCount(t, filteredCount, totalCount)
  const searchPlaceholder = placeholder ?? t('admin.search.default')
  const isNarrow = useIsNarrow()
  const [statsOpen, setStatsOpen] = useState(false)
  const bodyRef = useRef(null)
  const hasMountedFilters = useRef(false)
  const shellClass = [
    'admin-list-shell',
    variant ? `admin-list-shell--${variant}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const showFilterBar =
    showFilters && (Boolean(onQueryChange) || filters.length > 0 || Boolean(filterActions))

  // Los chips de filtro que ya traen su propio conteo cubren la misma información
  // que el strip de stats; en pantallas chicas repetirla cuesta una barra entera.
  const filtersCarryCounts = useMemo(
    () =>
      filters.some(
        (filter) =>
          filter.variant !== 'select' &&
          filter.options?.some(([, , count]) => count != null && count !== ''),
      ),
    [filters],
  )

  const statsAreRedundant = isNarrow && showFilterBar && filtersCarryCounts
  const showStatsStrip = showStats && !statsAreRedundant && (stats.length > 0 || totalCount != null)
  const useCollapsibleStats = collapseStatsOnMobile && isNarrow && showStatsStrip && stats.length > 0
  const statsExpanded = !useCollapsibleStats || statsOpen

  const filterSignature = useMemo(
    () => `${query ?? ''}|${filters.map((filter) => `${filter.id}:${filter.value}`).join('|')}`,
    [filters, query],
  )

  useEffect(() => {
    if (!hasMountedFilters.current) {
      hasMountedFilters.current = true
      return
    }
    const body = bodyRef.current
    if (!body) return
    body.classList.remove('is-filter-animating')
    void body.offsetWidth
    body.classList.add('is-filter-animating')
    const timer = window.setTimeout(() => body.classList.remove('is-filter-animating'), 480)
    return () => window.clearTimeout(timer)
  }, [filterSignature])

  const filterBar = showFilterBar ? (
    <AdminFilterBar
      actions={filterActions}
      className={[
        'admin-filters--external',
        variant ? `admin-filters--${variant}` : '',
      ]
        .filter(Boolean)
        .join(' ')}
      compact
      inline
      count={statsAreRedundant ? resultLabel : null}
      filters={filters}
      placeholder={searchPlaceholder}
      query={query}
      onQueryChange={onQueryChange}
    />
  ) : null

  const hasExternalHeader = showHeader && (Boolean(title) || Boolean(eyebrow) || Boolean(subtitle) || Boolean(meta) || Boolean(actions))
  const hasExternalToolbar = !showHeader && (Boolean(actions) || Boolean(meta))

  return (
    <div className={`admin-list-section${variant ? ` admin-list-section--${variant}` : ''}`}>
      {hasExternalHeader ? (
        <header className="admin-list-section__header admin-list-shell__header">
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
      ) : null}

      {hasExternalToolbar ? (
        <div className="admin-list-section__toolbar admin-list-shell__toolbar">
          {meta && (
            <span className="admin-list-shell__meta" aria-live="polite">
              {meta}
            </span>
          )}
          {actions && <div className="admin-list-shell__actions">{actions}</div>}
        </div>
      ) : null}

      {beforeFilters}
      {filterBar}

      <section className={shellClass}>
        {showStatsStrip && (
          <div
            className={`admin-list-shell__stats-panel${statsExpanded ? ' is-expanded' : ' is-collapsed'}`}
          >
            {useCollapsibleStats && (
              <div className="admin-list-shell__stats-toggle-bar">
                <span className="admin-list-shell__count" aria-live="polite">
                  {resultLabel}
                </span>
                <button
                  type="button"
                  className="admin-list-shell__stats-toggle"
                  aria-expanded={statsExpanded}
                  onClick={() => setStatsOpen((current) => !current)}
                >
                  {t('admin.summary.toggle')}
                  <ChevronDown size={14} aria-hidden className="admin-list-shell__stats-toggle-icon" />
                </button>
              </div>
            )}

            {statsExpanded && (
              <div className="admin-list-shell__stats-strip" aria-label={t('admin.summary.aria')}>
                {stats.map(({ label, tone = 'default', value }) => (
                  <article key={label} className={`admin-list-stat admin-list-stat--${tone}`}>
                    <span className="admin-list-stat__value">{value}</span>
                    <span className="admin-list-stat__label">{label}</span>
                  </article>
                ))}
                {!useCollapsibleStats && (
                  <div className="admin-list-shell__count-wrap">
                    <span className="admin-list-shell__count" aria-live="polite">
                      {resultLabel}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div ref={bodyRef} className="admin-list-shell__body">
          {children}
        </div>
      </section>
    </div>
  )
}
