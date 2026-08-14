import { createPortal } from 'react-dom'
import { AnimatePresence, m } from 'motion/react'
import { X } from 'lucide-react'
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
                onRejectPayment={onRejectPayment}
                onApproveTicketOrder={onApproveTicketOrder}
                onRejectTicketOrder={onRejectTicketOrder}
                canEdit={canEdit}
              />
            </div>
          </m.aside>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
