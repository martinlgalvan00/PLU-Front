import AuditTimeline from '../ui/AuditTimeline.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function RecentActivity({ compact = false, items = [] }) {
  const { t } = useI18n()

  return (
    <section
      className={`recent-activity surface-card surface-card--flat ${compact ? 'recent-activity--compact' : ''}`.trim()}
      aria-label={t('admin.recentActivity.aria')}
    >
      <header className="recent-activity__header">
        <h2>{t('admin.recentActivity.title')}</h2>
        <p>{t('admin.recentActivity.subtitle')}</p>
      </header>
      <AuditTimeline items={items} />
    </section>
  )
}
