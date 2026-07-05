import { AlertCircle, ArrowRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function ActionQueue({ compact = false, items = [], onNavigate, onApprovePayment, canEdit }) {
  const { t } = useI18n()

  const panelClass = [
    'action-queue',
    'surface-card',
    'surface-card--flat',
    compact ? 'action-queue--compact' : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (!items.length) {
    return (
      <section className={panelClass}>
        <header className="action-queue__header">
          <div>
            <h2>{t('admin.actionQueue.title')}</h2>
            <p>{t('admin.actionQueue.empty')}</p>
          </div>
          <span className="action-queue__count action-queue__count--ok">0</span>
        </header>
      </section>
    )
  }

  const tasksLabel =
    items.length === 1
      ? t('admin.actionQueue.tasks', { count: items.length })
      : t('admin.actionQueue.tasksMany', { count: items.length })

  return (
    <section className={panelClass}>
      <header className="action-queue__header">
        <div>
          <h2>{t('admin.actionQueue.title')}</h2>
          <p>{tasksLabel}</p>
        </div>
        <span className="action-queue__count">{items.length}</span>
      </header>
      <ul className="action-queue__list">
        {items.map((item) => (
          <li key={item.id} className={`action-queue__item action-queue__item--${item.priority}`}>
            {!compact && (
              <div className="action-queue__icon" aria-hidden>
                <AlertCircle size={18} />
              </div>
            )}
            <div className="action-queue__body">
              <div className="action-queue__title-row">
                <span className="action-queue__priority">
                  {t(`admin.actionQueue.priority.${item.priority}`)}
                </span>
                <strong>{item.title}</strong>
              </div>
              {item.detail && <p>{item.detail}</p>}
            </div>
            <div className="action-queue__actions">
              {item.paymentId && canEdit && (
                <button
                  type="button"
                  className="btn btn--small action-queue__btn"
                  onClick={(event) => {
                    event.stopPropagation()
                    onApprovePayment?.(item.paymentId)
                  }}
                >
                  {t('admin.actions.validate')}
                </button>
              )}
              <button
                type="button"
                className="btn btn--ghost btn--small action-queue__btn action-queue__btn--ghost"
                onClick={() => onNavigate?.(item.section)}
              >
                {t('admin.actions.view')}
                <ArrowRight size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
