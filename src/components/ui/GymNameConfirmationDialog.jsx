import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Dumbbell } from 'lucide-react'
import Button from './Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import '../../styles/components/gym-confirmation.css'

export default function GymNameConfirmationDialog({ gymName, onCancel, onConfirm }) {
  const { t } = useI18n()
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef(null)
  const dialogStateRef = useRef({ onCancel })
  dialogStateRef.current = { onCancel }

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector('button:not([aria-label])')?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        dialogStateRef.current.onCancel?.()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = panelRef.current?.querySelectorAll('button:not(:disabled)') ?? []
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus?.()
    }
  }, [])

  return createPortal(
    <div className="gym-confirmation-dialog">
      <button
        type="button"
        className="gym-confirmation-dialog__backdrop"
        aria-label={t('pages.register.gymConfirmation.cancel')}
        onClick={onCancel}
      />
      <section
        ref={panelRef}
        className="gym-confirmation-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <span className="gym-confirmation-dialog__icon" aria-hidden>
          <Dumbbell size={19} />
        </span>
        <div className="gym-confirmation-dialog__copy">
          <h2 id={titleId}>{t('pages.register.gymConfirmation.title')}</h2>
          <p id={descriptionId}>
            {t('pages.register.gymConfirmation.description', { gym: gymName })}
          </p>
          <p className="gym-confirmation-dialog__name">{gymName}</p>
          <p className="gym-confirmation-dialog__warning">
            {t('pages.register.gymConfirmation.warning')}
          </p>
        </div>
        <div className="gym-confirmation-dialog__actions">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t('pages.register.gymConfirmation.edit')}
          </Button>
          <Button type="button" onClick={onConfirm}>
            {t('pages.register.gymConfirmation.confirm')}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
