import AdminFilterChipGroup from './AdminFilterChipGroup.jsx'
import AdminFilterSearch from './AdminFilterSearch.jsx'
import AdminFilterSelect from './AdminFilterSelect.jsx'

/**
 * @typedef {Object} AdminFilterGroup
 * @property {string} id
 * @property {string} [label]
 * @property {string} value
 * @property {(value: string) => void} onChange
 * @property {[string, string][]} options
 * @property {'chips' | 'select'} [variant]
 */

export default function AdminFilterBar({
  compact = false,
  inline = false,
  query,
  onQueryChange,
  filters = [],
  placeholder = 'Buscar…',
}) {
  const className = [
    'admin-filters',
    'admin-filters--chips',
    compact ? 'admin-filters--compact' : '',
    inline ? 'admin-filters--inline' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className}>
      {filters.length > 0 && (
        <div className={`admin-filters__groups${filters.length > 2 ? ' admin-filters__groups--multi' : ''}`}>
          {filters.map((filter) =>
            filter.variant === 'select' ? (
              <AdminFilterSelect key={filter.id} {...filter} />
            ) : (
              <AdminFilterChipGroup key={filter.id} compact={compact} inline={inline} {...filter} />
            ),
          )}
        </div>
      )}

      <AdminFilterSearch placeholder={placeholder} query={query} onQueryChange={onQueryChange} />
    </div>
  )
}
