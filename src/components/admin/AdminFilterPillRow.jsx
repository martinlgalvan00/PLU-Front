import { useEffect, useRef, useState } from 'react'
import { Calendar, Check, ChevronDown, Search, X } from 'lucide-react'
import AdminFilterChipGroup from './AdminFilterChipGroup.jsx'
import AdminFilterDateRange from './AdminFilterDateRange.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'

function neutralValue(filter) {
  return filter.defaultValue ?? filter.options?.[0]?.[0]
}

function isFilterActive(filter) {
  if (filter.variant === 'dateRange') {
    return Boolean(filter.value?.from) || Boolean(filter.value?.to)
  }
  return filter.value !== neutralValue(filter)
}

function formatShortDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function pillValueText(filter, t) {
  if (filter.variant === 'dateRange') {
    const from = filter.value?.from
    const to = filter.value?.to
    if (from && to) return `${formatShortDate(from)} – ${formatShortDate(to)}`
    if (from) return `${t('admin.filters.registeredFrom')} ${formatShortDate(from)}`
    if (to) return `${t('admin.filters.registeredTo')} ${formatShortDate(to)}`
    return null
  }
  const active = filter.options?.find(([optionValue]) => optionValue === filter.value)
  return active ? active[1] : null
}

/** Combobox con búsqueda para filtros `variant: 'select'` con muchas opciones
 * (ej. gimnasio): filtra la lista ya calculada por el caller, no pide nada
 * nuevo al backend. */
function AdminFilterCombobox({ filter, onSelect, t }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [])

  const normalizedQuery = query.trim().toLowerCase()
  const visibleOptions = normalizedQuery
    ? (filter.options ?? []).filter(([, optionLabel]) =>
        String(optionLabel).toLowerCase().includes(normalizedQuery),
      )
    : (filter.options ?? [])

  return (
    <div className="admin-filter-popover__combobox">
      <div className="admin-filter-popover__search">
        <Search size={13} aria-hidden />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('admin.filters.searchOptions')}
          aria-label={t('admin.filters.searchOptions')}
        />
      </div>
      <div className="admin-filter-popover__options" role="listbox" aria-label={filter.ariaLabel ?? filter.label}>
        {visibleOptions.length > 0 ? (
          visibleOptions.map(([optionValue, optionLabel]) => {
            const selected = filter.value === optionValue
            return (
              <button
                key={optionValue}
                type="button"
                role="option"
                aria-selected={selected}
                className={`admin-filter-popover__option${selected ? ' is-selected' : ''}`}
                onClick={() => onSelect(optionValue)}
              >
                {selected ? (
                  <Check size={13} aria-hidden />
                ) : (
                  <span className="admin-filter-popover__option-spacer" aria-hidden />
                )}
                <span>{optionLabel}</span>
              </button>
            )
          })
        ) : (
          <p className="admin-filter-popover__empty">{t('admin.filters.noMatchingOptions')}</p>
        )}
      </div>
    </div>
  )
}

/**
 * Fila de filtros como pills compactos: cada uno abre un popover con el
 * control real (chips, combobox con búsqueda o rango de fechas) en vez de
 * apilar todos los grupos siempre visibles. Usada por `AdminFilterBar`
 * cuando se pasa `layout="popover"` -- la lógica de cada filtro (value,
 * onChange, options) es exactamente la misma que en el layout apilado.
 */
export default function AdminFilterPillRow({ filters }) {
  const { t } = useI18n()
  const [openId, setOpenId] = useState(null)

  useEffect(() => {
    if (!openId) return undefined

    function handlePointerDown(event) {
      const scope = event.target.closest('[data-pill-scope]')
      if (!scope || scope.getAttribute('data-pill-scope') !== openId) {
        setOpenId(null)
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpenId(null)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openId])

  return (
    <div className="admin-filter-pillrow">
      {filters.map((filter) => {
        const active = isFilterActive(filter)
        const open = openId === filter.id
        const valueText = active ? pillValueText(filter, t) : null
        const accessibleName = filter.ariaLabel ?? filter.label

        return (
          <div
            key={filter.id}
            data-pill-scope={filter.id}
            className={['admin-filter-pill', active ? 'is-active' : '', open ? 'is-open' : '']
              .filter(Boolean)
              .join(' ')}
          >
            <button
              type="button"
              className="admin-filter-pill__trigger"
              aria-expanded={open}
              aria-haspopup="dialog"
              onClick={() => setOpenId((current) => (current === filter.id ? null : filter.id))}
            >
              {filter.variant === 'dateRange' ? (
                <Calendar className="admin-filter-pill__icon" size={13} aria-hidden />
              ) : null}
              <span className="admin-filter-pill__label">{accessibleName}</span>
              {valueText ? (
                <>
                  <span className="admin-filter-pill__divider" aria-hidden="true" />
                  <span className="admin-filter-pill__value">{valueText}</span>
                </>
              ) : null}
              <ChevronDown className="admin-filter-pill__chevron" size={13} aria-hidden />
            </button>

            {active ? (
              <button
                type="button"
                className="admin-filter-pill__clear"
                aria-label={t('admin.filters.clearFilter')}
                onClick={(event) => {
                  event.stopPropagation()
                  filter.onChange(neutralValue(filter))
                }}
              >
                <X size={11} aria-hidden />
              </button>
            ) : null}

            {open ? (
              <div className="admin-filter-popover" role="dialog" aria-label={accessibleName}>
                {filter.variant === 'select' ? (
                  <AdminFilterCombobox
                    filter={filter}
                    t={t}
                    onSelect={(value) => {
                      filter.onChange(value)
                      setOpenId(null)
                    }}
                  />
                ) : filter.variant === 'dateRange' ? (
                  <AdminFilterDateRange
                    id={filter.id}
                    value={filter.value}
                    onChange={filter.onChange}
                    disabled={filter.disabled}
                  />
                ) : (
                  <AdminFilterChipGroup
                    id={filter.id}
                    ariaLabel={accessibleName}
                    value={filter.value}
                    onChange={(value) => {
                      filter.onChange(value)
                      setOpenId(null)
                    }}
                    options={filter.options}
                    disabled={filter.disabled}
                    defaultValue={neutralValue(filter)}
                    omitNeutral
                    allLabel={filter.allLabel ?? t('admin.filters.showingAll')}
                    clearable
                    hideEmpty
                  />
                )}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
