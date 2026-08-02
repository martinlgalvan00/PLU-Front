import { useMemo } from 'react'
import { ArrowRight, BadgeCheck, ClipboardList, CreditCard, Ticket } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

const PRIORITY_ORDER = ['high', 'medium', 'low']

const TYPE_ICONS = {
  payment: CreditCard,
  registration: ClipboardList,
  membership: BadgeCheck,
  ticket_order: Ticket,
}

export default function ActionQueue({
  compact = false,
  embedded = false,
  showHeader = true,
  items = [],
  onNavigate,
  onApprovePayment,
  onApproveTicketOrder,
  canEdit,
}) {
  const { t } = useI18n()

  const groups = useMemo(
    () =>
      PRIORITY_ORDER.map((priority) => ({
        priority,
        items: items.filter((item) => item.priority === priority),
      })).filter((group) => group.items.length > 0),
    [items],
  )

  const panelClass = [
    'action-queue',
    embedded ? 'action-queue--drawer' : 'surface-card surface-card--flat',
    compact ? 'action-queue--compact' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const Wrapper = embedded ? 'div' : 'section'

  if (!items.length) {
    return (
      <Wrapper className={panelClass}>
        {showHeader && (
          <header className="action-queue__header">
            <div>
              <h2>{t('admin.actionQueue.title')}</h2>
              <p>{t('admin.actionQueue.empty')}</p>
            </div>
            <span className="action-queue__count action-queue__count--ok">0</span>
          </header>
        )}
        {!showHeader && (
          <p className="action-queue__empty-inline">{t('admin.actionQueue.empty')}</p>
        )}
      </Wrapper>
    )
  }

  const tasksLabel =
    items.length === 1
      ? t('admin.actionQueue.tasks', { count: items.length })
      : t('admin.actionQueue.tasksMany', { count: items.length })

  return (
    <Wrapper className={panelClass}>
      {showHeader && (
        <header className="action-queue__header">
          <div>
            <h2>{t('admin.actionQueue.title')}</h2>
            <p>{tasksLabel}</p>
          </div>
          <span className="action-queue__count">{items.length}</span>
        </header>
      )}

      <div className="action-queue__groups">
        {groups.map(({ priority, items: groupItems }) => (
          <section key={priority} className={`action-queue__group action-queue__group--${priority}`}>
            <header className="action-queue__group-head">
              <span className={`action-queue__group-label action-queue__group-label--${priority}`}>
                {t(`admin.actionQueue.priority.${priority}`)}
              </span>
              <span className="action-queue__group-count">{groupItems.length}</span>
            </header>

            <ul className="action-queue__list">
              {groupItems.map((item) => {
                const TypeIcon = TYPE_ICONS[item.type] ?? ClipboardList
                const typeLabel = t(`admin.actionQueue.types.${item.type}`)

                return (
                  <li key={item.id} className={`action-queue__card action-queue__card--${item.priority}`}>
                    <div className="action-queue__card-head">
                      <span className={`action-queue__type action-queue__type--${item.type}`}>
                        <TypeIcon size={13} aria-hidden />
                        {typeLabel}
                      </span>
                      <span className="action-queue__summary">{item.summary}</span>
                    </div>

                    <div className="action-queue__card-body">
                      <strong className="action-queue__subject">{item.subject}</strong>
                      {(item.detail || item.meta) && (
                        <div className="action-queue__meta">
                          {item.detail && <span className="action-queue__meta-item">{item.detail}</span>}
                          {item.meta && (
                            <span className="action-queue__meta-item action-queue__meta-item--accent">
                              {item.meta}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="action-queue__actions">
                      {item.paymentId && canEdit && (
                        <button
                          type="button"
                          className="btn btn--small action-queue__btn action-queue__btn--primary"
                          onClick={(event) => {
                            event.stopPropagation()
                            onApprovePayment?.(item.paymentId)
                          }}
                        >
                          {t('admin.actions.validate')}
                        </button>
                      )}
                      {item.orderId && canEdit && (
                        <button
                          type="button"
                          className="btn btn--small action-queue__btn action-queue__btn--primary"
                          onClick={(event) => {
                            event.stopPropagation()
                            onApproveTicketOrder?.(item.orderId)
                          }}
                        >
                          {t('admin.actions.validate')}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn--ghost btn--small action-queue__btn action-queue__btn--ghost"
                        // El id viaja con la navegación para que la sección
                        // destino pueda enfocar la fila: antes "ver" llevaba a
                        // una pantalla donde el ítem ni siquiera figuraba.
                        onClick={() => onNavigate?.(item.section, item.paymentId ?? item.orderId ?? null)}
                      >
                        {t('admin.actions.view')}
                        <ArrowRight size={14} aria-hidden />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </Wrapper>
  )
}
