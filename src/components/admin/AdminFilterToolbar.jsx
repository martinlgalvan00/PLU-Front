import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react'
import AdminFilterDateRange from './AdminFilterDateRange.jsx'
import AdminFilterSearch from './AdminFilterSearch.jsx'
import '../../styles/components/admin-toolbar.css'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { filterValueText, isFilterActive, neutralValue } from '../../lib/adminFilterValue.js'

/**
 * Barra de filtros de los listados de Personas (`AdminFilterBar layout="toolbar"`).
 *
 * Tres niveles, de lo más usado a lo menos:
 *  1. Buscador + «Filtros» (un solo popover) + acciones del listado.
 *  2. Lente de estado: las pestañas de la faceta que parte el listado
 *     (`surface: 'rail'`) y, al lado, atajos a lo que pide atención
 *     (`quickOption` o `variant: 'toggle'`): perfil incompleto, por vencer…
 *  3. Criterios aplicados como etiquetas que se quitan de a una. Solo existe
 *     cuando hay algo aplicado.
 *
 * El popover reemplaza a «Más criterios» + sus buscadores anidados: cada
 * criterio es un control nativo (select) o un grupo corto de opciones, sin
 * listas con scroll propio dentro de un panel con scroll.
 */

const POPOVER_GAP = 8
const POPOVER_MARGIN = 12
const POPOVER_WIDTH = 400

function hasCount(count) {
  return count !== undefined && count !== null && count !== ''
}

function isEmptyCount(count) {
  return hasCount(count) && Number(count) === 0
}

function placePopover(trigger, popover) {
  const rect = trigger.getBoundingClientRect()
  const width = Math.min(POPOVER_WIDTH, window.innerWidth - POPOVER_MARGIN * 2)
  // Alineado al borde izquierdo del botón (suele ir pegado al buscador, a la
  // izquierda); si no entra, se corre hasta el margen del viewport.
  let left = rect.left
  if (left + width > window.innerWidth - POPOVER_MARGIN) {
    left = window.innerWidth - POPOVER_MARGIN - width
  }
  if (left < POPOVER_MARGIN) left = POPOVER_MARGIN
  const spaceBelow = window.innerHeight - rect.bottom - POPOVER_GAP - POPOVER_MARGIN
  const spaceAbove = rect.top - POPOVER_GAP - POPOVER_MARGIN
  const flip = spaceBelow < 320 && spaceAbove > spaceBelow
  const available = Math.max(200, flip ? spaceAbove : spaceBelow)

  popover.style.position = 'fixed'
  popover.style.width = `${width}px`
  popover.style.left = `${Math.round(left)}px`
  popover.style.maxHeight = `${Math.min(560, available)}px`
  if (flip) {
    popover.style.top = 'auto'
    popover.style.bottom = `${Math.round(window.innerHeight - rect.top + POPOVER_GAP)}px`
  } else {
    popover.style.top = `${Math.round(rect.bottom + POPOVER_GAP)}px`
    popover.style.bottom = 'auto'
  }
  popover.dataset.placed = 'true'
}

/** Opción de atajo (`quickOption`) de un filtro de chips, o `null` si no aplica. */
function resolveQuick(filter) {
  if (filter.quickOption == null) return null
  const option = filter.options?.find(([value]) => value === filter.quickOption)
  if (!option) return null
  return { value: option[0], label: option[1], count: option[2] }
}

/** Atajo binario de un `variant: 'toggle'` (la primera opción no neutra). */
function resolveToggle(filter) {
  const neutral = neutralValue(filter)
  const option = filter.options?.find(([value]) => value !== neutral)
  if (!option) return null
  return { value: option[0], label: option[1], count: option[2] }
}

export default function AdminFilterToolbar({
  actions = null,
  className = '',
  count = null,
  extra = null,
  filters = [],
  onQueryChange,
  placeholder,
  query,
}) {
  const { t } = useI18n()
  const popoverId = useId()
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const popoverRef = useRef(null)

  const railFilters = useMemo(() => filters.filter((filter) => filter.surface === 'rail'), [filters])

  const quickChips = useMemo(() => {
    const chips = []
    for (const filter of filters) {
      if (filter.surface === 'rail') continue
      const quick =
        filter.variant === 'toggle' && !filter.advanced ? resolveToggle(filter) : resolveQuick(filter)
      if (!quick) continue
      const pressed = filter.value === quick.value
      if (isEmptyCount(quick.count) && !pressed) continue
      chips.push({ filter, quick, pressed })
    }
    return chips
  }, [filters])

  // Lo que vive en el popover: todo menos la faceta de riel y los toggles ya
  // resueltos como atajo. Un filtro con `quickOption` se queda además acá,
  // porque tiene más opciones que la del atajo.
  const popoverFilters = useMemo(
    () =>
      filters.filter(
        (filter) => filter.surface !== 'rail' && !(filter.variant === 'toggle' && !filter.advanced),
      ),
    [filters],
  )
  const popoverActive = popoverFilters.filter(isFilterActive)
  const hasQuery = Boolean(query && String(query).trim())

  // Etiquetas aplicadas: criterios del popover que no son ya un atajo activo.
  const tags = useMemo(
    () =>
      popoverFilters.filter((filter) => {
        if (!isFilterActive(filter)) return false
        const quick = resolveQuick(filter)
        return !(quick && filter.value === quick.value)
      }),
    [popoverFilters],
  )

  const appliedCount = useMemo(
    () => filters.filter(isFilterActive).length + (hasQuery ? 1 : 0),
    [filters, hasQuery],
  )

  function clearAll() {
    filters.filter(isFilterActive).forEach((filter) => filter.onChange(neutralValue(filter)))
    if (hasQuery) onQueryChange?.('')
  }

  function clearPopover() {
    popoverActive.forEach((filter) => filter.onChange(neutralValue(filter)))
  }

  function closePopover(restoreFocus = true) {
    setOpen(false)
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  useEffect(() => {
    if (!open) return undefined
    function handlePointerDown(event) {
      if (popoverRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) {
        return
      }
      setOpen(false)
    }
    function handleKeyDown(event) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      closePopover()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) return undefined
    const popover = popoverRef.current
    const trigger = triggerRef.current
    if (!popover || !trigger) return undefined

    function place() {
      placePopover(trigger, popover)
    }
    place()
    const frame = window.requestAnimationFrame(place)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    window.requestAnimationFrame(() =>
      popoverRef.current
        ?.querySelector('select, button, input')
        ?.focus({ preventScroll: true }),
    )
  }, [open])

  function renderSegments(filter) {
    const neutral = neutralValue(filter)
    const options = filter.options ?? []
    return (
      <div
        key={filter.id}
        className="admin-toolbar__segments"
        role="group"
        aria-label={filter.ariaLabel ?? filter.label}
      >
        {options.map(([value, label, optionCount]) => {
          const pressed = filter.value === value
          if (isEmptyCount(optionCount) && !pressed) return null
          const isNeutral = value === neutral
          return (
            <button
              key={value}
              type="button"
              className={`admin-toolbar__segment${pressed ? ' is-active' : ''}`}
              aria-pressed={pressed}
              disabled={filter.disabled}
              onClick={() => filter.onChange(pressed ? neutral : value)}
            >
              <span className="admin-toolbar__segment-label">
                {isNeutral ? (filter.allLabel || t('admin.filters.showingAll')) : label}
              </span>
              {hasCount(optionCount) ? (
                <span className="admin-toolbar__segment-count">{optionCount}</span>
              ) : null}
            </button>
          )
        })}
      </div>
    )
  }

  function renderField(filter) {
    const id = `${popoverId}-${filter.id}`
    const label = filter.label

    if (filter.variant === 'dateRange') {
      return (
        <div key={filter.id} className="admin-toolbar__field">
          <span className="admin-toolbar__field-label">{label}</span>
          <AdminFilterDateRange
            id={filter.id}
            value={filter.value}
            onChange={filter.onChange}
            disabled={filter.disabled}
            presentation="popover"
          />
        </div>
      )
    }

    if (filter.variant === 'select') {
      return (
        <div key={filter.id} className="admin-toolbar__field">
          <label className="admin-toolbar__field-label" htmlFor={id}>
            {label}
          </label>
          <span className="admin-toolbar__select">
            <select
              id={id}
              value={filter.value}
              disabled={filter.disabled}
              onChange={(event) => filter.onChange(event.target.value)}
            >
              {(filter.options ?? []).map(([value, optionLabel]) => (
                <option key={value} value={value}>
                  {optionLabel}
                </option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden />
          </span>
        </div>
      )
    }

    const neutral = neutralValue(filter)
    return (
      <div key={filter.id} className="admin-toolbar__field">
        <span className="admin-toolbar__field-label" id={`${id}-label`}>
          {label}
        </span>
        <div className="admin-toolbar__options" role="group" aria-labelledby={`${id}-label`}>
          {(filter.options ?? [])
            .filter(([value]) => value !== neutral)
            .map(([value, optionLabel, optionCount]) => {
              const pressed = filter.value === value
              if (isEmptyCount(optionCount) && !pressed) return null
              return (
                <button
                  key={value}
                  type="button"
                  className={`admin-toolbar__option${pressed ? ' is-active' : ''}`}
                  aria-pressed={pressed}
                  disabled={filter.disabled}
                  onClick={() => filter.onChange(pressed ? neutral : value)}
                >
                  {optionLabel}
                  {hasCount(optionCount) ? (
                    <span className="admin-toolbar__option-count">{optionCount}</span>
                  ) : null}
                </button>
              )
            })}
        </div>
      </div>
    )
  }

  const showLens = railFilters.length > 0 || quickChips.length > 0 || Boolean(count)
  const showFiltersButton = popoverFilters.length > 0

  return (
    <div className={['admin-toolbar', className].filter(Boolean).join(' ')}>
      <div className="admin-toolbar__row admin-toolbar__row--search">
        <AdminFilterSearch placeholder={placeholder} query={query} onQueryChange={onQueryChange} />

        {showFiltersButton ? (
          <button
            ref={triggerRef}
            type="button"
            className={[
              'admin-toolbar__trigger',
              open ? 'is-open' : '',
              popoverActive.length > 0 ? 'is-active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-controls={open ? popoverId : undefined}
            onClick={() => setOpen((current) => !current)}
          >
            <SlidersHorizontal size={15} aria-hidden />
            <span>{t('admin.filters.toggle')}</span>
            {popoverActive.length > 0 ? (
              <span
                className="admin-toolbar__badge"
                aria-label={t('admin.filters.activeCount', { count: popoverActive.length })}
              >
                {popoverActive.length}
              </span>
            ) : null}
          </button>
        ) : null}

        {actions ? <div className="admin-toolbar__actions">{actions}</div> : null}
      </div>

      {showLens ? (
        <div className="admin-toolbar__row admin-toolbar__row--lens">
          {railFilters.map(renderSegments)}

          {quickChips.length > 0 ? (
            <div className="admin-toolbar__quick" role="group" aria-label={t('admin.filters.toggle')}>
              {quickChips.map(({ filter, quick, pressed }) => (
                <button
                  key={filter.id}
                  type="button"
                  className={`admin-toolbar__chip${pressed ? ' is-active' : ''}`}
                  aria-pressed={pressed}
                  disabled={filter.disabled}
                  onClick={() => filter.onChange(pressed ? neutralValue(filter) : quick.value)}
                >
                  <span className="admin-toolbar__chip-dot" aria-hidden />
                  {quick.label}
                  {hasCount(quick.count) ? (
                    <span className="admin-toolbar__chip-count">{quick.count}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          {count ? (
            <span className="admin-toolbar__count" aria-live="polite">
              {count}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="admin-toolbar__tags">
        {tags.map((filter) => (
          <span key={filter.id} className="admin-toolbar__tag">
            <span className="admin-toolbar__tag-label">{filter.label}</span>
            <span className="admin-toolbar__tag-value">{filterValueText(filter, t)}</span>
            <button
              type="button"
              aria-label={`${t('admin.filters.clearFilter')}: ${filter.label}`}
              onClick={() => filter.onChange(neutralValue(filter))}
            >
              <X size={11} aria-hidden />
            </button>
          </span>
        ))}
        {appliedCount > 1 ? (
          <button type="button" className="admin-toolbar__clear" onClick={clearAll}>
            {t('admin.filters.clearAll')}
          </button>
        ) : null}
        {extra}
      </div>

      {open ? (
        <div
          ref={popoverRef}
          id={popoverId}
          className="admin-toolbar__popover"
          role="dialog"
          aria-labelledby={titleId}
        >
          <div className="admin-toolbar__popover-head">
            <h2 id={titleId}>{t('admin.filters.toggle')}</h2>
            <button
              type="button"
              className="admin-toolbar__popover-close"
              aria-label={t('admin.filters.closeAdvanced')}
              onClick={() => closePopover()}
            >
              <X size={16} aria-hidden />
            </button>
          </div>
          <div className="admin-toolbar__popover-body">{popoverFilters.map(renderField)}</div>
          <div className="admin-toolbar__popover-foot">
            {popoverActive.length > 0 ? (
              <button type="button" className="admin-toolbar__popover-clear" onClick={clearPopover}>
                {t('admin.filters.clearAdvanced')}
              </button>
            ) : (
              <span aria-hidden />
            )}
            <button type="button" className="admin-toolbar__popover-done" onClick={() => closePopover()}>
              {t('admin.filters.done')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
