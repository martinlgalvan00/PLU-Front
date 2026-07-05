import { Bell, Search } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function AdminTopBar({
  title,
  subtitle,
  eyebrow,
  searchValue,
  onSearchChange,
  showSearch = true,
  alertCount = 0,
  onAlertClick,
  showAlerts = true,
  searchPlaceholder,
}) {
  const { t } = useI18n()
  const placeholder = searchPlaceholder ?? t('admin.search.dashboard')

  const alertLabel =
    alertCount > 0
      ? alertCount === 1
        ? t('admin.dashboard.alertsCount', { count: alertCount })
        : t('admin.dashboard.alertsCountMany', { count: alertCount })
      : t('admin.dashboard.alertsNone')

  return (
    <header className="admin-page-toolbar admin-page-toolbar--dashboard">
      <div className="admin-page-toolbar__headline">
        {eyebrow && <span className="admin-page-toolbar__eyebrow">{eyebrow}</span>}
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
                placeholder={placeholder}
                value={searchValue}
                onChange={(event) => onSearchChange?.(event.target.value)}
              />
            </label>
          )}
          {showAlerts && (
            <button
              type="button"
              className={`admin-page-toolbar__alert${alertCount > 0 ? ' has-alerts' : ''}`}
              aria-label={alertLabel}
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
