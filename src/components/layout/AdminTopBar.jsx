import { Bell, Search } from 'lucide-react'

export default function AdminTopBar({
  title,
  subtitle,
  eyebrow = 'PLU ARG',
  searchValue,
  onSearchChange,
  showSearch = true,
  alertCount = 0,
  onAlertClick,
  showAlerts = true,
}) {
  return (
    <header className="admin-page-toolbar">
      <div className="admin-page-toolbar__headline">
        <span className="admin-page-toolbar__eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {subtitle && <p className="admin-page-toolbar__subtitle">{subtitle}</p>}
      </div>

      {(showSearch || showAlerts) && (
        <div className="admin-page-toolbar__tools">
          {showSearch && (
            <label className="admin-page-toolbar__search">
              <Search size={17} aria-hidden />
              <input
                type="search"
                placeholder="Buscar atleta, DNI o evento"
                value={searchValue}
                onChange={(event) => onSearchChange?.(event.target.value)}
              />
            </label>
          )}
          {showAlerts && (
            <button
              type="button"
              className={`admin-page-toolbar__alert${alertCount > 0 ? ' has-alerts' : ''}`}
              aria-label={
                alertCount > 0
                  ? `${alertCount} alerta${alertCount === 1 ? '' : 's'} operativa${alertCount === 1 ? '' : 's'}`
                  : 'Sin alertas operativas'
              }
              onClick={onAlertClick}
            >
              <Bell size={18} />
              {alertCount > 0 && <span className="admin-page-toolbar__badge">{alertCount}</span>}
            </button>
          )}
        </div>
      )}
    </header>
  )
}
