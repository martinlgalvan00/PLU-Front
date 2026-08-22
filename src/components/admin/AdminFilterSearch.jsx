import { Search, X } from 'lucide-react'

export default function AdminFilterSearch({ placeholder = 'Buscar…', query, onQueryChange }) {
  return (
    <div className="admin-filters__search" role="search">
      <Search size={16} className="admin-filters__search-icon" aria-hidden />
      <input
        type="search"
        className="admin-filters__search-input"
        placeholder={placeholder}
        value={query ?? ''}
        onChange={(event) => onQueryChange(event.target.value)}
        aria-label={placeholder}
      />
      {query ? (
        <button
          type="button"
          className="admin-filters__search-clear"
          aria-label="Limpiar búsqueda"
          onClick={() => onQueryChange('')}
        >
          <X size={13} aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
