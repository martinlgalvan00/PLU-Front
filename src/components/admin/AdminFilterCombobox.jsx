import { useEffect, useRef, useState } from 'react'
import { Check, Search } from 'lucide-react'

/** Combobox con búsqueda para filtros `variant: 'select'` con muchas opciones
 * (ej. gimnasio): filtra la lista ya calculada por el caller, no pide nada
 * nuevo al backend. Usado por `AdminFilterPillRow` (un combobox por pill,
 * foco automático) y `AdminFilterPanel` (varios juntos en un panel -- ahí
 * `autoFocus={false}`, si no el de Gimnasio se roba el foco apenas se abre
 * el panel, sin que nadie haya tocado ese campo). */
export default function AdminFilterCombobox({ filter, onSelect, t, autoFocus = true }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (!autoFocus) return undefined
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [autoFocus])

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
