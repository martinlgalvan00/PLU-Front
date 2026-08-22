import { useEffect, useState } from 'react'
import { Calendar, ChevronDown, X } from 'lucide-react'
import AdminFilterChipGroup from './AdminFilterChipGroup.jsx'
import AdminFilterCombobox from './AdminFilterCombobox.jsx'
import AdminFilterDateRange from './AdminFilterDateRange.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { filterValueText, isFilterActive, neutralValue } from '../../lib/adminFilterValue.js'

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
        const valueText = active ? filterValueText(filter, t) : null
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
