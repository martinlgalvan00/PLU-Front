import { useEffect, useRef, useState } from 'react'
import { Bookmark, Plus, X } from 'lucide-react'

/**
 * Fila de combinaciones de filtro guardadas (`useAdminSavedFilterViews`),
 * arriba de la barra de filtros de una sección. Reutiliza las clases de
 * `.admin-filter-chip` (`admin-filter-group--compact`) para que el chip
 * "★ Vista" se vea igual que los chips de estado que ya tiene la barra.
 */
export default function AdminSavedViews({
  views = [],
  activeViewId = null,
  allLabel,
  caption,
  addLabel,
  namePlaceholder,
  removeAriaLabel,
  canSave = false,
  onApply,
  onClear,
  onSave,
  onRemove,
}) {
  const [creating, setCreating] = useState(false)
  const [draftLabel, setDraftLabel] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (creating) inputRef.current?.focus()
  }, [creating])

  if (views.length === 0 && !canSave) return null

  function startCreating() {
    setDraftLabel('')
    setCreating(true)
  }

  function confirmCreating() {
    const trimmed = draftLabel.trim()
    setCreating(false)
    setDraftLabel('')
    if (trimmed) onSave(trimmed)
  }

  function cancelCreating() {
    setCreating(false)
    setDraftLabel('')
  }

  return (
    <div
      className="admin-saved-views admin-filter-group--compact"
      role="group"
      aria-label={caption}
    >
      <span className="admin-saved-views__caption">{caption}</span>
      <div className="admin-filter-chips">
        <button
          type="button"
          className={`admin-filter-chip${activeViewId == null ? ' is-active' : ''}`}
          aria-pressed={activeViewId == null}
          onClick={onClear}
        >
          <span className="admin-filter-chip__label">{allLabel}</span>
        </button>

        {views.map((view) => (
          <span
            key={view.id}
            className={`admin-saved-views__item${activeViewId === view.id ? ' is-active' : ''}`}
          >
            <button
              type="button"
              className={`admin-filter-chip admin-saved-views__chip${activeViewId === view.id ? ' is-active' : ''}`}
              aria-pressed={activeViewId === view.id}
              onClick={() => onApply(view)}
            >
              <Bookmark size={11} aria-hidden />
              <span className="admin-filter-chip__label">{view.label}</span>
            </button>
            <button
              type="button"
              className="admin-saved-views__remove"
              aria-label={removeAriaLabel(view.label)}
              onClick={() => onRemove(view.id)}
            >
              <X size={11} aria-hidden />
            </button>
          </span>
        ))}

        {creating ? (
          <form
            className="admin-saved-views__form"
            onSubmit={(event) => {
              event.preventDefault()
              confirmCreating()
            }}
          >
            <input
              ref={inputRef}
              type="text"
              className="admin-saved-views__input"
              value={draftLabel}
              maxLength={40}
              placeholder={namePlaceholder}
              onChange={(event) => setDraftLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelCreating()
                }
              }}
              onBlur={confirmCreating}
            />
          </form>
        ) : canSave ? (
          <button type="button" className="admin-saved-views__add" onClick={startCreating}>
            <Plus size={12} aria-hidden />
            <span>{addLabel}</span>
          </button>
        ) : null}
      </div>
    </div>
  )
}
