import { useEffect, useRef, useState } from 'react'
import { Plus, SlidersHorizontal, X } from 'lucide-react'

/**
 * Fila de combinaciones de filtro guardadas (`useAdminSavedFilterViews`),
 * arriba de la barra de filtros de una sección. Reutiliza las clases de
 * `.admin-filter-chip` (`admin-filter-group--compact`) para que el chip
 * "★ Vista" se vea igual que los chips de estado que ya tiene la barra.
 *
 * @param {object} props
 * @param {Array<{label: string, value: string}>} [props.filterSummary]
 *   Resumen de los filtros activos que se van a guardar. Si no se pasa,
 *   el popover muestra solo el input sin preview.
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
  filterSummary = [],
  onApply,
  onClear,
  onSave,
  onRemove,
}) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [draftLabel, setDraftLabel] = useState('')
  const popoverRef = useRef(null)
  const inputRef = useRef(null)
  const addBtnRef = useRef(null)

  useEffect(() => {
    if (popoverOpen) {
      setDraftLabel('')
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [popoverOpen])

  // Cerrar al hacer click fuera del popover
  useEffect(() => {
    if (!popoverOpen) return undefined
    function handlePointerDown(event) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target) &&
        addBtnRef.current &&
        !addBtnRef.current.contains(event.target)
      ) {
        setPopoverOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [popoverOpen])

  if (views.length === 0 && !canSave) return null

  function handleSave() {
    const trimmed = draftLabel.trim()
    setPopoverOpen(false)
    setDraftLabel('')
    if (trimmed) onSave(trimmed)
  }

  return (
    <div
      className="admin-saved-views"
      role="group"
      aria-label={caption}
    >
      <span className="admin-saved-views__caption">{caption}</span>
      <div className="admin-saved-views__list">
        <button
          type="button"
          className={`admin-saved-views__tab${activeViewId == null ? ' is-active' : ''}`}
          aria-pressed={activeViewId == null}
          onClick={onClear}
        >
          {allLabel}
        </button>

        {views.map((view) => (
          <span
            key={view.id}
            className={`admin-saved-views__item${activeViewId === view.id ? ' is-active' : ''}`}
          >
            <button
              type="button"
              className={`admin-saved-views__tab${activeViewId === view.id ? ' is-active' : ''}`}
              aria-pressed={activeViewId === view.id}
              onClick={() => onApply(view)}
            >
              {view.label}
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

        {canSave ? (
          <div className="admin-saved-views__add-wrap">
            <button
              ref={addBtnRef}
              type="button"
              className={`admin-saved-views__add${popoverOpen ? ' is-open' : ''}`}
              aria-expanded={popoverOpen}
              aria-haspopup="dialog"
              onClick={() => setPopoverOpen((prev) => !prev)}
            >
              <Plus size={12} aria-hidden />
              <span>{addLabel}</span>
            </button>

            {popoverOpen ? (
              <div
                ref={popoverRef}
                className="admin-saved-views__popover"
                role="dialog"
                aria-label={addLabel}
              >
                {filterSummary.length > 0 ? (
                  <div className="admin-saved-views__snapshot">
                    <span className="admin-saved-views__snapshot-title">
                      <SlidersHorizontal size={11} aria-hidden />
                      Filtros activos
                    </span>
                    <ul className="admin-saved-views__snapshot-list">
                      {filterSummary.map(({ label, value }) => (
                        <li key={label} className="admin-saved-views__snapshot-item">
                          <span className="admin-saved-views__snapshot-label">{label}</span>
                          <span className="admin-saved-views__snapshot-value">{value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <form
                  className="admin-saved-views__popover-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    handleSave()
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
                        setPopoverOpen(false)
                      }
                    }}
                  />
                  <div className="admin-saved-views__popover-actions">
                    <button
                      type="button"
                      className="admin-saved-views__cancel"
                      onClick={() => setPopoverOpen(false)}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="admin-saved-views__confirm"
                      disabled={!draftLabel.trim()}
                    >
                      Guardar
                    </button>
                  </div>
                </form>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
