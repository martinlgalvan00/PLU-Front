import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react'
import AdminFilterChipGroup from './AdminFilterChipGroup.jsx'
import AdminFilterSearch from './AdminFilterSearch.jsx'
import AdminFilterSelect from './AdminFilterSelect.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * @typedef {Object} AdminFilterGroup
 * @property {string} id
 * @property {string} [label]
 * @property {string} value
 * @property {(value: string) => void} onChange
 * @property {[string, string][]} options
 * @property {'chips' | 'select'} [variant]
 * @property {string} [defaultValue] Valor sin filtro; por convención, la primera opción.
 */

function neutralValue(filter) {
  return filter.defaultValue ?? filter.options?.[0]?.[0]
}

function isFilterActive(filter) {
  return filter.value !== neutralValue(filter)
}

export default function AdminFilterBar({
  actions = null,
  className = '',
  compact = false,
  inline = false,
  count = null,
  query,
  onQueryChange,
  filters = [],
  placeholder = 'Buscar…',
}) {
  const { t } = useI18n()
  const panelId = useId()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const rootRef = useRef(null)
  const hasMountedFilters = useRef(false)
  const rootClassName = [
    'admin-filters',
    'admin-filters--chips',
    compact ? 'admin-filters--compact' : '',
    inline ? 'admin-filters--inline' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const activeFilters = filters.filter(isFilterActive)
  const hasQuery = Boolean(query && query.trim())
  const activeCount = activeFilters.length + (hasQuery ? 1 : 0)
  const filterSignature = useMemo(
    () => `${query ?? ''}|${filters.map((filter) => `${filter.id}:${filter.value}`).join('|')}`,
    [filters, query],
  )

  useEffect(() => {
    if (!hasMountedFilters.current) {
      hasMountedFilters.current = true
      return
    }
    const root = rootRef.current
    if (!root) return
    root.classList.remove('is-filter-applied')
    void root.offsetWidth
    root.classList.add('is-filter-applied')
    const timer = window.setTimeout(() => root.classList.remove('is-filter-applied'), 420)
    return () => window.clearTimeout(timer)
  }, [filterSignature])

  function clearAll() {
    activeFilters.forEach((filter) => filter.onChange(neutralValue(filter)))
    if (hasQuery) onQueryChange('')
  }

  return (
    <div ref={rootRef} className={rootClassName}>
      <div className="admin-filters__primary">
        <AdminFilterSearch placeholder={placeholder} query={query} onQueryChange={onQueryChange} />

        {filters.length > 0 ? (
          <button
            type="button"
            className={`admin-filters__toggle${filtersOpen ? ' is-open' : ''}`}
            aria-controls={panelId}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((current) => !current)}
          >
            <SlidersHorizontal size={14} aria-hidden />
            <span>{t('admin.filters.toggle')}</span>
            {activeCount > 0 ? (
              <span
                className="admin-filters__active-count"
                aria-label={t('admin.filters.activeCount', { count: activeCount })}
              >
                {activeCount}
              </span>
            ) : null}
            <ChevronDown className="admin-filters__toggle-icon" size={13} aria-hidden />
          </button>
        ) : null}

        {activeCount > 0 ? (
          <button type="button" className="admin-filters__clear" onClick={clearAll}>
            <X size={12} aria-hidden />
            <span>{t('admin.filters.clearActive', { count: activeCount })}</span>
          </button>
        ) : null}

        {actions ? <div className="admin-filters__actions">{actions}</div> : null}
      </div>

      {filters.length > 0 ? (
        <div
          id={panelId}
          className={`admin-filters__panel${filtersOpen ? ' is-open' : ''}`}
        >
          <div className="admin-filters__panel-inner">
            <div
              className={`admin-filters__groups${filters.length > 2 ? ' admin-filters__groups--multi' : ''}`}
            >
              {filters.map((filter) =>
                filter.variant === 'select' ? (
                  <AdminFilterSelect key={filter.id} {...filter} />
                ) : (
                  <AdminFilterChipGroup
                    key={filter.id}
                    compact={compact}
                    inline={inline}
                    ariaLabel={filter.ariaLabel}
                    id={filter.id}
                    label={filter.label}
                    value={filter.value}
                    onChange={filter.onChange}
                    options={filter.options}
                    disabled={filter.disabled}
                  />
                ),
              )}
            </div>
          </div>
        </div>
      ) : null}

      {count ? (
        <span className="admin-filters__count" aria-live="polite">
          {count}
        </span>
      ) : null}
    </div>
  )
}
