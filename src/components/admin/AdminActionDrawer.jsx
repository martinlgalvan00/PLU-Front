import { createPortal } from 'react-dom'
import { AnimatePresence, m } from 'motion/react'
import { Check, X } from 'lucide-react'
import ActionQueue from './ActionQueue.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { drawerBackdropTransition, drawerTransition } from '../../motion/variants.ts'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { useAdminModal } from './useAdminModal.js'

export default function AdminActionDrawer({
  open,
  onClose,
  items = [],
  onNavigate,
  onApprovePayment,
  onRejectPayment,
  onApproveTicketOrder,
  onRejectTicketOrder,
  canEdit,
  canDismiss,
  onDismissItem,
}) {
  const { t } = useI18n()
  const { reducedMotion } = useMotionConfig()
  const panelRef = useAdminModal(() => onClose?.(), { active: open })

  function handleNavigate(section) {
    onClose?.()
    onNavigate?.(section)
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <m.button
            type="button"
            className="admin-action-drawer__backdrop"
            aria-label={t('admin.actionQueue.close')}
            onClick={onClose}
            initial={reducedMotion ? false : 'hidden'}
            animate="visible"
            exit="exit"
            variants={drawerBackdropTransition}
          />
          <m.aside
            ref={panelRef}
            id="admin-action-drawer"
            className="admin-action-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t('admin.actionQueue.drawerLabel')}
            initial={reducedMotion ? false : 'hidden'}
            animate="visible"
            exit="exit"
            variants={drawerTransition}
          >
            <header className="admin-action-drawer__head">
              <div className="admin-action-drawer__head-copy">
                <span className="admin-action-drawer__eyebrow">{t('admin.actionQueue.eyebrow')}</span>
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
              <div className="admin-action-drawer__head-side">
                {items.length > 0 ? (
                  <div className="admin-action-drawer__count">
                    <strong className="admin-action-drawer__count-value">{items.length}</strong>
                    <span className="admin-action-drawer__count-label">
                      {t('admin.actionQueue.countLabel')}
                    </span>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="admin-action-drawer__close"
                  aria-label={t('admin.actionQueue.close')}
                  onClick={onClose}
                >
                  <X size={18} aria-hidden />
                </button>
              </div>
            </header>

            {items.length === 0 ? (
              <div className="admin-action-drawer__empty">
                <span className="admin-action-drawer__empty-mark" aria-hidden="true">
                  <Check size={16} strokeWidth={2.25} />
                </span>
                <h3>{t('admin.actionQueue.emptyTitle')}</h3>
                <p>{t('admin.actionQueue.empty')}</p>
              </div>
            ) : (
              <div className="admin-action-drawer__body">
                <ActionQueue
                  compact
                  embedded
                  showHeader={false}
                  items={items}
                  onNavigate={handleNavigate}
                  onApprovePayment={onApprovePayment}
                  onRejectPayment={onRejectPayment}
                  onApproveTicketOrder={onApproveTicketOrder}
                  onRejectTicketOrder={onRejectTicketOrder}
                  canEdit={canEdit}
                  canDismiss={canDismiss}
                  onDismissItem={onDismissItem}
                />
              </div>
            )}
          </m.aside>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
