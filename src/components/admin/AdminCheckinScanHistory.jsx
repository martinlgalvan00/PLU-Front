import { Clock3, History, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatDocumentWithKind } from '../../lib/format.js'

export default function AdminCheckinScanHistory({ items = [], onClear, onSelect }) {
  const { t } = useI18n()

  if (!items.length) {
    return (
      <section className="admin-checkin-history admin-checkin-history--empty" aria-label={t('admin.checkin.history.title')}>
        <span className="admin-checkin-history__empty-icon" aria-hidden>
          <History size={20} strokeWidth={1.5} />
        </span>
        <div className="admin-checkin-history__empty-copy">
          <h3 className="admin-checkin-history__title">{t('admin.checkin.history.title')}</h3>
          <p className="admin-checkin-history__empty">{t('admin.checkin.history.empty')}</p>
          <p className="admin-checkin-history__hint">{t('admin.checkin.history.emptyHint')}</p>
        </div>
      </section>
    )
  }

  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  return (
    <section className="admin-checkin-history" aria-label={t('admin.checkin.history.title')}>
      <header className="admin-checkin-history__header">
        <div>
          <h3 className="admin-checkin-history__title">{t('admin.checkin.history.title')}</h3>
          <p className="admin-checkin-history__hint">{t('admin.checkin.history.hint')}</p>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClear}>
          <Trash2 size={14} aria-hidden />
          {t('admin.checkin.history.clear')}
        </button>
      </header>

      <ol className="admin-checkin-history__list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={[
                'admin-checkin-history__item',
                `admin-checkin-history__item--${item.tone}`,
                item.active ? 'admin-checkin-history__item--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelect?.(item)}
            >
              <span className="admin-checkin-history__time">
                <Clock3 size={13} aria-hidden />
                {timeFormatter.format(new Date(item.scannedAt))}
              </span>
              <span className="admin-checkin-history__outcome">
                {item.checkedIn
                  ? t('admin.checkin.history.checkedIn')
                  : t(`admin.checkin.scanner.outcome.${item.outcome}`)}
              </span>
              <span className="admin-checkin-history__person">
                {item.name || t('admin.checkin.history.unknown')}
                {item.document ? ` · ${formatDocumentWithKind(item.document)}` : ''}
              </span>
              {item.type && (
                <span className="admin-checkin-history__type">
                  {item.type === 'atleta' ? t('admin.checkin.athlete') : t('admin.checkin.spectator')}
                </span>
              )}
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
