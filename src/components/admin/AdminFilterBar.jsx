import { X } from 'lucide-react'
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
 * @property {string} [defaultValue] Valor "sin filtro" -- por convención, la primera opción.
 */

function neutralValue(filter) {
  return filter.defaultValue ?? filter.options?.[0]?.[0]
}

function isFilterActive(filter) {
  return filter.value !== neutralValue(filter)
}

export default function AdminFilterBar({
  className = '',
  compact = false,
  inline = false,
  query,
  onQueryChange,
  filters = [],
  placeholder = 'Buscar…',
}) {
  const { t } = useI18n()
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

  function clearAll() {
    activeFilters.forEach((filter) => filter.onChange(neutralValue(filter)))
    if (hasQuery) onQueryChange('')
  }

  return (
    <div className={rootClassName}>
      {filters.length > 0 && (
        <div className={`admin-filters__groups${filters.length > 2 ? ' admin-filters__groups--multi' : ''}`}>
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
      )}

      <AdminFilterSearch placeholder={placeholder} query={query} onQueryChange={onQueryChange} />

      {activeCount > 0 && (
        <button type="button" className="admin-filters__clear" onClick={clearAll}>
          <X size={12} aria-hidden />
          {t('admin.filters.clearActive', { count: activeCount })}
        </button>
      )}
    </div>
  )
}
