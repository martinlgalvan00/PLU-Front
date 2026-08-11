import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { LoaderCircle, Trash2 } from 'lucide-react'
import Button from '../ui/Button.jsx'

/**
 * Confirmación de borrado definitivo del panel admin (usuarios de staff,
 * atletas). Los textos llegan por props porque cada entidad tiene su propio
 * copy i18n; la estructura y los estilos (`admin-user-delete-dialog`) son
 * compartidos.
 */
export default function AdminDeleteConfirmDialog({
  busy,
  error,
  onCancel,
  onConfirm,
  title,
  description,
  warning,
  cancelLabel,
  confirmLabel,
  busyLabel,
}) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef(null)
  const dialogStateRef = useRef({ busy, onCancel })
  dialogStateRef.current = { busy, onCancel }

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector('button')?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !dialogStateRef.current.busy) {
        event.preventDefault()
        dialogStateRef.current.onCancel()
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
    <div className="admin-user-delete-dialog">
      <button
        type="button"
        className="admin-user-delete-dialog__backdrop"
        aria-label={cancelLabel}
        disabled={busy}
        onClick={onCancel}
      />
      <section
        ref={panelRef}
        className="admin-user-delete-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <span className="admin-user-delete-dialog__icon" aria-hidden>
          <Trash2 size={19} />
        </span>
        <div className="admin-user-delete-dialog__copy">
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
          <p className="admin-user-delete-dialog__warning">{warning}</p>
          {error ? (
            <p className="admin-user-delete-dialog__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="admin-user-delete-dialog__actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            className="admin-user-delete-dialog__confirm"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? <LoaderCircle size={15} aria-hidden /> : <Trash2 size={15} aria-hidden />}
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
