import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import ActionQueue from './ActionQueue.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function AdminActionDrawer({
  open,
  onClose,
  items = [],
  onNavigate,
  onApprovePayment,
  onApproveTicketOrder,
  canEdit,
}) {
  const { t } = useI18n()

  useEffect(() => {
    if (!open) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose?.()
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  function handleNavigate(section) {
    onClose?.()
    onNavigate?.(section)
  }

  return createPortal(
    <>
      <button
        type="button"
        className="admin-action-drawer__backdrop is-open"
        aria-label={t('admin.actionQueue.close')}
        onClick={onClose}
      />
      <aside
        id="admin-action-drawer"
        className="admin-action-drawer is-open"
        role="dialog"
        aria-modal="true"
        aria-label={t('admin.actionQueue.drawerLabel')}
      >
        <header className="admin-action-drawer__head">
          <div className="admin-action-drawer__head-copy">
            <span className="admin-action-drawer__eyebrow">{t('admin.dashboard.title')}</span>
            <h2>{t('admin.actionQueue.title')}</h2>
            {items.length > 0 && (
              <p className="admin-action-drawer__subtitle">
                {['high', 'medium', 'low']
                  .map((priority) => {
                    const count = items.filter((item) => item.priority === priority).length
                    if (!count) return null
                    return `${count} ${t(`admin.actionQueue.priority.${priority}`).toLowerCase()}`
                  })
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>
          <button
            type="button"
            className="admin-action-drawer__close"
            aria-label={t('admin.actionQueue.close')}
            onClick={onClose}
          >
            <X size={18} aria-hidden />
          </button>
        </header>
        <div className="admin-action-drawer__body">
          <ActionQueue
            compact
            embedded
            showHeader={false}
            items={items}
            onNavigate={handleNavigate}
            onApprovePayment={onApprovePayment}
            onApproveTicketOrder={onApproveTicketOrder}
            canEdit={canEdit}
          />
        </div>
      </aside>
    </>,
    document.body,
  )
}
