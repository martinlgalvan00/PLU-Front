import { useCallback, useMemo, useRef } from 'react'

function resolveNeutralValue(options, defaultValue) {
  if (defaultValue !== undefined && defaultValue !== null) return defaultValue
  return options?.[0]?.[0]
}

function isEmptyCount(count) {
  return count !== undefined && count !== null && count !== '' && Number(count) === 0
}

/**
 * Fila de chips con scroll horizontal arrastrable (touch + mouse).
 * Evita convertir filtros a <select> en mobile.
 *
 * @param {object} props
 * @param {boolean} [props.omitNeutral] Oculta la opción neutra larga y usa `allLabel` corto.
 * @param {string} [props.allLabel] Etiqueta corta del valor neutro (ej. "Todos").
 * @param {boolean} [props.clearable] Click en el chip activo vuelve al valor neutro.
 * @param {boolean} [props.hideEmpty] Oculta opciones con conteo 0 (salvo la activa).
 * @param {string} [props.defaultValue] Valor neutro; por defecto, la primera opción.
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
  defaultValue,
  omitNeutral = false,
  allLabel = null,
  clearable = false,
  hideEmpty = false,
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

  const neutral = useMemo(
    () => resolveNeutralValue(options, defaultValue),
    [defaultValue, options],
  )

  const visibleOptions = useMemo(() => {
    return options.filter(([optionValue, , optionCount]) => {
      if (omitNeutral && optionValue === neutral) return false
      if (hideEmpty && isEmptyCount(optionCount) && optionValue !== value) return false
      return true
    })
  }, [hideEmpty, neutral, omitNeutral, options, value])

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

  function handleChipClick(optionValue) {
    if (clearable && optionValue === value) {
      onChange(neutral)
      return
    }
    onChange(optionValue)
  }

  const showAllChip = omitNeutral && Boolean(allLabel)
  const allActive = value === neutral

  return (
    <div
      className={[
        'admin-filter-group',
        'admin-filter-group--rail',
        compact ? 'admin-filter-group--compact' : '',
        inline ? 'admin-filter-group--inline' : '',
        allActive ? 'admin-filter-group--all' : '',
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
      <div className="admin-filter-chips-rail">
        <div
          ref={chipsRef}
          className="admin-filter-chips"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
        {showAllChip ? (
          <button
            type="button"
            className={[
              'admin-filter-chip',
              'admin-filter-chip--all',
              allActive ? 'is-active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-pressed={allActive}
            disabled={disabled}
            onClick={() => onChange(neutral)}
          >
            <span className="admin-filter-chip__label">{allLabel}</span>
          </button>
        ) : null}

        {visibleOptions.map((option) => {
          const [optionValue, optionLabel, optionCount] = option
          const active = value === optionValue
          const showCount = optionCount !== undefined && optionCount !== null && optionCount !== ''
          const zeroCount = showCount && Number(optionCount) === 0
          const chipClass = [
            'admin-filter-chip',
            active ? 'is-active' : '',
            showCount ? 'admin-filter-chip--counted' : '',
            zeroCount ? 'admin-filter-chip--zero' : '',
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
              onClick={() => handleChipClick(optionValue)}
            >
              <span className="admin-filter-chip__label">{optionLabel}</span>
              {showCount ? (
                <span
                  className={`admin-filter-chip__count${zeroCount ? ' is-zero' : ''}`.trim()}
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
    </div>
  )
}
