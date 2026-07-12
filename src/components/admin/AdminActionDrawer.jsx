import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m } from 'motion/react'
import { X } from 'lucide-react'
import ActionQueue from './ActionQueue.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { drawerBackdropTransition, drawerTransition } from '../../motion/variants.ts'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'

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
  const { reducedMotion } = useMotionConfig()

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

            <ActionQueue
              items={items}
              onNavigate={handleNavigate}
              onApprovePayment={onApprovePayment}
              onApproveTicketOrder={onApproveTicketOrder}
              canEdit={canEdit}
            />
          </m.aside>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
