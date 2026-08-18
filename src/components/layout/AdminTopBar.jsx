import { ArrowRight, Bell, Search } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function AdminTopBar({
  title,
  subtitle,
  eyebrow,
  searchValue,
  onSearchChange,
  onSearchSubmit,
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

  function handleSearchSubmit(event) {
    event.preventDefault()
    onSearchSubmit?.(searchValue)
  }

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
          {showSearch && (
            <form
              className="admin-page-toolbar__search"
              role="search"
              data-tour="dashboard-search"
              onSubmit={handleSearchSubmit}
            >
              <Search size={17} aria-hidden />
              <input
                type="search"
                aria-label={placeholder}
                autoComplete="off"
                placeholder={placeholder}
                value={searchValue}
                onChange={(event) => onSearchChange?.(event.target.value)}
              />
              <button
                type="submit"
                className="admin-page-toolbar__search-submit"
                aria-label={t('admin.search.submit')}
                disabled={!searchValue?.trim()}
              >
                <ArrowRight size={15} aria-hidden />
              </button>
            </form>
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
