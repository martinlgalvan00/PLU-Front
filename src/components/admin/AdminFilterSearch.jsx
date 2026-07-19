import { Search, X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function AdminFilterSearch({ placeholder = 'Buscar…', query, onQueryChange }) {
  const { t } = useI18n()

  return (
    <div className="admin-filters__search" role="search">
      <Search size={16} aria-hidden />
      <input
        type="search"
        aria-label={placeholder}
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && query) {
            event.preventDefault()
            onQueryChange('')
          }
        }}
      />
      {query ? (
        <button
          type="button"
          className="admin-filters__search-clear"
          aria-label={t('admin.filters.clearSearch')}
          onClick={() => onQueryChange('')}
        >
          <X size={13} aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
