import { Bell, Search } from 'lucide-react'

export default function AdminTopBar({ title, subtitle, searchValue, onSearchChange, alertCount = 0 }) {
  return (
    <header className="admin-topbar">
      <div className="admin-topbar__titles">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="admin-topbar__actions">
        <label className="admin-topbar__search">
          <Search size={18} />
          <input
            type="search"
            placeholder="Buscar atleta, DNI o evento…"
            value={searchValue}
            onChange={(e) => onSearchChange?.(e.target.value)}
          />
        </label>
        <button type="button" className="admin-topbar__alert" aria-label="Alertas operativas">
          <Bell size={18} />
          {alertCount > 0 && <span className="admin-topbar__badge">{alertCount}</span>}
        </button>
      </div>
    </header>
  )
}
