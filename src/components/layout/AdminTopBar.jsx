import { Bell, CalendarDays, Search } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function AdminTopBar({
  title,
  subtitle,
  eyebrow,
  searchValue,
  onSearchChange,
  showSearch = true,
  alertCount = 0,
  alertsOpen = false,
  onAlertClick,
  showAlerts = true,
  searchPlaceholder,
  showDate = true,
}) {
  const { locale, t } = useI18n()
  const placeholder = searchPlaceholder ?? t('admin.search.dashboard')
  const dateLabel = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'long',
    weekday: 'long',
  }).format(new Date())

  const alertLabel =
    alertCount > 0
      ? alertCount === 1
        ? t('admin.dashboard.alertsCount', { count: alertCount })
        : t('admin.dashboard.alertsCountMany', { count: alertCount })
      : t('admin.dashboard.alertsNone')

  return (
    <header className="admin-page-toolbar admin-page-toolbar--dashboard">
      <div className="admin-page-toolbar__headline">
        <div className="admin-page-toolbar__meta">
          {eyebrow && <span className="admin-page-toolbar__eyebrow">{eyebrow}</span>}
          {showDate && (
            <span className="admin-page-toolbar__date">
              <CalendarDays size={13} strokeWidth={1.7} aria-hidden />
              {dateLabel}
            </span>
          )}
        </div>
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
              aria-controls="admin-action-drawer"
              aria-expanded={alertsOpen}
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
