import AuditTimeline from '../ui/AuditTimeline.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function RecentActivity({ compact = false, items = [] }) {
  const { t } = useI18n()

  return (
    <section
      className={`recent-activity${compact ? ' recent-activity--compact' : ''}`.trim()}
      aria-label={t('admin.recentActivity.aria')}
    >
      <header className="recent-activity__header">
        <div className="recent-activity__header-copy">
          <span className="recent-activity__eyebrow">{t('admin.recentActivity.eyebrow')}</span>
          <h2>{t('admin.recentActivity.title')}</h2>
          <p>{t('admin.recentActivity.subtitle')}</p>
        </div>
        {items.length > 0 ? (
          <span className="recent-activity__count">{items.length}</span>
        ) : null}
      </header>
      <AuditTimeline items={items} />
    </section>
  )
}
