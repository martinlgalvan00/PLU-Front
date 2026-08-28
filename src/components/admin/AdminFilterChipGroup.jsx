import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

function resolveNeutralValue(options, defaultValue) {
  if (defaultValue !== undefined && defaultValue !== null) return defaultValue
  return options?.[0]?.[0]
}

function isEmptyCount(count) {
  return count !== undefined && count !== null && count !== '' && Number(count) === 0
}

/**
 * Fila de chips con scroll horizontal arrastrable (touch + mouse), o menú
 * vertical cuando `presentation="menu"` (popover de pills).
 * Evita convertir filtros a <select> en mobile.
 *
 * @param {object} props
 * @param {'rail'|'menu'} [props.presentation='rail'] `menu` = lista vertical en popover.
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
  presentation = 'rail',
}) {
  const isMenu = presentation === 'menu'
  const labelId = label ? `${id}-label` : undefined
  const chipsRef = useRef(null)
  const [overflowing, setOverflowing] = useState(false)
  const dragRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    scrollLeft: 0,
    pointerId: null,
  })

  const neutral = useMemo(() => resolveNeutralValue(options, defaultValue), [defaultValue, options])

  const visibleOptions = useMemo(() => {
    return options.filter(([optionValue, , optionCount]) => {
      if (omitNeutral && optionValue === neutral) return false
      if (hideEmpty && isEmptyCount(optionCount) && optionValue !== value) return false
      return true
    })
  }, [hideEmpty, neutral, omitNeutral, options, value])

  const showAllChip = omitNeutral && Boolean(allLabel)
  const allActive = value === neutral
  const allCount = useMemo(() => {
    const allOption = options.find(([optionValue]) => optionValue === neutral)
    return allOption?.[2]
  }, [neutral, options])
  const showAllCount = allCount !== undefined && allCount !== null && allCount !== ''
  const populatedCounted = visibleOptions.filter(([, , optionCount]) => {
    return (
      optionCount !== undefined &&
      optionCount !== null &&
      optionCount !== '' &&
      Number(optionCount) > 0
    )
  })
  const allCountIsTwin =
    showAllCount &&
    populatedCounted.length === 1 &&
    Number(populatedCounted[0][2]) === Number(allCount)
  const renderAllCount = showAllCount && !allCountIsTwin

  useEffect(() => {
    if (isMenu) {
      setOverflowing(false)
      return undefined
    }

    const el = chipsRef.current
    if (!el) return undefined

    function syncOverflow() {
      setOverflowing(el.scrollWidth > el.clientWidth + 1)
    }

    syncOverflow()
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(syncOverflow)
      observer.observe(el)

      const handleWheel = (e) => {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
        if (e.deltaY !== 0) {
          e.preventDefault()
          el.scrollLeft += e.deltaY
        }
      }
      el.addEventListener('wheel', handleWheel, { passive: false })

      return () => {
        observer.disconnect()
        el.removeEventListener('wheel', handleWheel)
      }
    }
  }, [allLabel, isMenu, showAllChip, visibleOptions])

  const endDrag = useCallback((event) => {
    const state = dragRef.current
    const el = chipsRef.current
    if (!state.active || !el) return

    state.active = false
    el.classList.remove('is-dragging')

    if (state.pointerId != null) {
      // capture removed
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
    if (isMenu) return
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
    el.classList.add('is-dragging')
  }

  function handlePointerMove(event) {
    if (isMenu) return
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

  return (
    <div
      className={[
        'admin-filter-group',
        'admin-filter-group--rail',
        isMenu ? 'admin-filter-group--menu' : '',
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
      <div
        className={['admin-filter-chips-rail', overflowing ? 'is-overflowing' : '']
          .filter(Boolean)
          .join(' ')}
      >
        <div
          ref={chipsRef}
          className={['admin-filter-chips', isMenu ? 'admin-filter-chips--menu' : '']
            .filter(Boolean)
            .join(' ')}
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
                renderAllCount ? 'admin-filter-chip--counted' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={allActive}
              disabled={disabled}
              onClick={() => onChange(neutral)}
            >
              <span className="admin-filter-chip__label">{allLabel}</span>
              {renderAllCount ? (
                <span className="admin-filter-chip__count" aria-hidden>
                  {allCount}
                </span>
              ) : null}
            </button>
          ) : null}

          {visibleOptions.map((option) => {
            const [optionValue, optionLabel, optionCount, optionTone] = option
            const active = value === optionValue
            const showCount =
              optionCount !== undefined && optionCount !== null && optionCount !== ''
            const zeroCount = showCount && Number(optionCount) === 0
            const chipClass = [
              'admin-filter-chip',
              active ? 'is-active' : '',
              showCount ? 'admin-filter-chip--counted' : '',
              zeroCount ? 'admin-filter-chip--zero' : '',
              active && optionTone ? `admin-filter-chip--tone-${optionTone}` : '',
              !active && optionTone ? `admin-filter-chip--hint-${optionTone}` : '',
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
