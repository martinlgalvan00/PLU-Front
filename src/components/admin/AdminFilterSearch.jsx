import { Search } from 'lucide-react'

export default function AdminFilterSearch({ placeholder = 'Buscar…', query, onQueryChange }) {
  return (
    <label className="admin-filters__search">
      <Search size={16} aria-hidden />
      <input
        placeholder={placeholder}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
    </label>
  )
}
