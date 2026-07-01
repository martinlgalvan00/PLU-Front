import { Filter, Search } from 'lucide-react'

export default function AdminFilterBar({ query, onQueryChange, filters = [], placeholder = 'Buscar…' }) {
  return (
    <div className="admin-filters">
      <label>
        <Search size={16} />
        <input
          placeholder={placeholder}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>
      {filters.map((filter) => (
        <label key={filter.id}>
          <Filter size={16} />
          <select value={filter.value} onChange={(event) => filter.onChange(event.target.value)}>
            {filter.options.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  )
}
