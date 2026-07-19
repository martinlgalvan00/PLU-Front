import { Search } from 'lucide-react'

export default function AdminFilterSearch({ placeholder = 'Buscar…', query, onQueryChange }) {
  return (
    <label className="admin-filters__search">
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
    </label>
  )
}
