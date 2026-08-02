import { useCallback, useRef } from 'react'
import { Check } from 'lucide-react'

/**
 * Fila de chips con scroll horizontal arrastrable (touch + mouse).
 * Evita convertir filtros a <select> en mobile.
 */
export default function AdminFilterChipGroup({
  id,
  label,
  ariaLabel,
  value,
  onChange,
  options = [],
  compact = false,
  inline = false,
  disabled = false,
}) {
  const labelId = label ? `${id}-label` : undefined
  const chipsRef = useRef(null)
  const dragRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    scrollLeft: 0,
    pointerId: null,
  })

  const endDrag = useCallback((event) => {
    const state = dragRef.current
    const el = chipsRef.current
    if (!state.active || !el) return

    state.active = false
    el.classList.remove('is-dragging')

    if (state.pointerId != null && el.hasPointerCapture?.(state.pointerId)) {
      el.releasePointerCapture(state.pointerId)
    }

    // Si hubo arrastre real, bloqueá el click del chip una sola vez.
    if (state.moved) {
      const blockClick = (clickEvent) => {
        clickEvent.preventDefault()
        clickEvent.stopPropagation()
        el.removeEventListener('click', blockClick, true)
      }
      el.addEventListener('click', blockClick, true)
    }

    state.moved = false
    state.pointerId = null
    void event
  }, [])

  function handlePointerDown(event) {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    const el = chipsRef.current
    if (!el || el.scrollWidth <= el.clientWidth + 1) return

    dragRef.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      scrollLeft: el.scrollLeft,
      pointerId: event.pointerId,
    }
    el.setPointerCapture?.(event.pointerId)
    el.classList.add('is-dragging')
  }

  function handlePointerMove(event) {
    const state = dragRef.current
    const el = chipsRef.current
    if (!state.active || !el) return

    const delta = event.clientX - state.startX
    if (Math.abs(delta) > 4) state.moved = true
    el.scrollLeft = state.scrollLeft - delta
  }

  return (
    <div
      className={[
        'admin-filter-group',
        compact ? 'admin-filter-group--compact' : '',
        inline ? 'admin-filter-group--inline' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="group"
      aria-label={!label ? ariaLabel || undefined : undefined}
      aria-labelledby={labelId}
    >
      {label && (
        <span id={labelId} className="admin-filter-group__label">
          {label}
        </span>
      )}
      <div
        ref={chipsRef}
        className="admin-filter-chips"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {options.map((option) => {
          const [optionValue, optionLabel, optionCount] = option
          const active = value === optionValue
          const showCount = optionCount !== undefined && optionCount !== null && optionCount !== ''
          const isZeroCount = showCount && Number(optionCount) === 0
          const chipClass = [
            'admin-filter-chip',
            active ? 'is-active' : '',
            showCount ? 'admin-filter-chip--counted' : '',
            isZeroCount ? 'admin-filter-chip--zero' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <button
              key={optionValue}
              type="button"
              className={chipClass}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(optionValue)}
            >
              {!compact ? (
                <span className="admin-filter-chip__indicator" aria-hidden>
                  {active ? <Check size={10} strokeWidth={2.5} /> : null}
                </span>
              ) : null}
              <span className="admin-filter-chip__label">{optionLabel}</span>
              {showCount ? (
                <span
                  className={`admin-filter-chip__count${isZeroCount ? ' is-zero' : ''}`.trim()}
                  aria-hidden
                >
                  {optionCount}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
