import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Trash2 } from 'lucide-react'
import Button from '../ui/Button.jsx'

/**
 * Confirmación de borrado definitivo del panel admin (usuarios de staff,
 * atletas, eventos). Los textos llegan por props porque cada entidad tiene su
 * propio copy i18n; la estructura y los estilos (`admin-user-delete-dialog`)
 * son compartidos.
 *
 * `confirmPhrase` sube el costo del click cuando lo borrado no se puede
 * reconstruir (un evento con inscripciones pagadas y acreditaciones): hasta
 * que no se escribe el identificador exacto, el botón no se habilita.
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
  confirmPhrase = null,
  confirmPhraseLabel,
  confirmPhraseHint,
}) {
  const titleId = useId()
  const descriptionId = useId()
  const phraseId = useId()
  const hintId = useId()
  const panelRef = useRef(null)
  const [phrase, setPhrase] = useState('')
  const phraseMatches = !confirmPhrase || phrase.trim() === confirmPhrase
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
      const focusable =
        panelRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled)') ?? []
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

  // La confirmación puede aparecer después de abierto el diálogo (el backend
  // responde que el borrado necesita consentimiento explícito): sin esto el
  // foco se queda en el botón que acaba de quedar deshabilitado.
  useEffect(() => {
    if (!confirmPhrase) return
    panelRef.current?.querySelector('input')?.focus()
  }, [confirmPhrase])

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
          {confirmPhrase ? (
            <div className="admin-user-delete-dialog__phrase">
              <label htmlFor={phraseId}>{confirmPhraseLabel}</label>
              <input
                id={phraseId}
                type="text"
                value={phrase}
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                placeholder={confirmPhrase}
                aria-describedby={confirmPhraseHint ? hintId : undefined}
                onChange={(event) => setPhrase(event.target.value)}
              />
              {/* La pista va como descripción y no dentro del label: si formara
                  parte del nombre accesible, el lector de pantalla anunciaría
                  el slug completo cada vez que el foco vuelve al campo. */}
              {confirmPhraseHint ? <small id={hintId}>{confirmPhraseHint}</small> : null}
            </div>
          ) : null}
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
            className={
              busy
                ? 'admin-user-delete-dialog__confirm is-busy'
                : 'admin-user-delete-dialog__confirm'
            }
            disabled={busy || !phraseMatches}
            onClick={onConfirm}
          >
            {busy ? (
              <span className="plu-spinner plu-spinner--sm" aria-hidden="true" />
            ) : (
              <Trash2 size={15} aria-hidden />
            )}
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
