import { Bell } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import AdminGlobalSearch from '../admin/AdminGlobalSearch.jsx'

export default function AdminTopBar({
  title,
  subtitle,
  eyebrow,
  onSearchSubmit,
  showSearch = true,
  alertCount = 0,
  alertsOpen = false,
  onAlertClick,
  showAlerts = true,
  searchPlaceholder,
  showDate = true,
  athletes = [],
  events = [],
  onSelectAthlete,
  onSelectEvent,
}) {
  const { locale, t } = useI18n()
  const placeholder = searchPlaceholder ?? t('admin.search.dashboard')
  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
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
        {(eyebrow || showDate) && (
          <div className="admin-page-toolbar__meta">
            {eyebrow ? <span className="admin-page-toolbar__eyebrow">{eyebrow}</span> : null}
            {showDate ? (
              <time
                className="admin-page-toolbar__date"
                dateTime={new Date().toISOString().slice(0, 10)}
              >
                {dateLabel}
              </time>
            ) : null}
          </div>
        )}
        <h1>{title}</h1>
        {subtitle ? <p className="admin-page-toolbar__subtitle">{subtitle}</p> : null}
      </div>

      {(showSearch || showAlerts) && (
        <div className="admin-page-toolbar__tools">
          {showSearch ? (
            <AdminGlobalSearch
              variant="toolbar"
              athletes={athletes}
              events={events}
              onSelectAthlete={onSelectAthlete}
              onSelectEvent={onSelectEvent}
              onFreeTextSubmit={onSearchSubmit}
              placeholder={placeholder}
              data-tour="dashboard-search"
            />
          ) : null}
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
