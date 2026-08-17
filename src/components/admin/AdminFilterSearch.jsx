import { Input } from 'antd'
import { Search } from 'lucide-react'

export default function AdminFilterSearch({ placeholder = 'Buscar…', query, onQueryChange }) {
  return (
    <div className="admin-filters__search" role="search">
      <Input
        allowClear
        placeholder={placeholder}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        prefix={<Search size={16} color="var(--color-text-muted)" />}
        style={{ width: '100%' }}
        variant="borderless"
      />
    </div>
  )
}
