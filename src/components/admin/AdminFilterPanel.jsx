import { useEffect, useRef, useState } from 'react'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import AdminFilterChipGroup from './AdminFilterChipGroup.jsx'
import AdminFilterCombobox from './AdminFilterCombobox.jsx'
import AdminFilterDateRange from './AdminFilterDateRange.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { neutralValue } from '../../lib/adminFilterValue.js'

/**
 * Botón único "Filtros" que abre un panel con todos los grupos juntos, en vez
 * de un pill por filtro (ver `AdminFilterPillRow`). Usado por `AdminFilterBar`
 * cuando se pasa `layout="panel"`.
 *
 * El resumen de lo aplicado (chips removibles) lo dibuja `AdminFilterBar`
 * aparte, fuera de este ancla: necesita el ancho completo de la barra, no el
 * de este botón, así que vive como hermano de `.admin-filter-popoverbar__row1`
 * en vez de adentro de este componente.
 */
export default function AdminFilterPanel({ filters, activeCount }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const anchorRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    function handlePointerDown(event) {
      if (anchorRef.current && !anchorRef.current.contains(event.target)) setOpen(false)
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function renderField(filter) {
    if (filter.variant === 'dateRange') {
      return (
        <div key={filter.id} className="admin-filter-panel__field">
          <span className="admin-filter-panel__field-label">{filter.label}</span>
          <AdminFilterDateRange
            id={filter.id}
            value={filter.value}
            onChange={filter.onChange}
            disabled={filter.disabled}
          />
        </div>
      )
    }

    if (filter.variant === 'select') {
      return (
        <div key={filter.id} className="admin-filter-panel__field">
          <span className="admin-filter-panel__field-label">{filter.label}</span>
          <AdminFilterCombobox filter={filter} t={t} onSelect={filter.onChange} autoFocus={false} />
        </div>
      )
    }

    return (
      <div key={filter.id} className="admin-filter-panel__field">
        <span className="admin-filter-panel__field-label">{filter.label}</span>
        <AdminFilterChipGroup
          id={filter.id}
          ariaLabel={filter.ariaLabel ?? filter.label}
          value={filter.value}
          onChange={filter.onChange}
          options={filter.options}
          disabled={filter.disabled}
          defaultValue={neutralValue(filter)}
          omitNeutral
          allLabel={filter.allLabel ?? t('admin.filters.showingAll')}
          clearable
          hideEmpty
        />
      </div>
    )
  }

  return (
    <div ref={anchorRef} className="admin-filter-panel-anchor">
      <button
        type="button"
        className={[
          'admin-filter-panel-trigger',
          open ? 'is-open' : '',
          activeCount > 0 ? 'has-active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        <SlidersHorizontal size={15} aria-hidden />
        <span className="admin-filter-panel-trigger__label">{t('admin.filters.toggle')}</span>
        {activeCount > 0 ? (
          <span
            className="admin-filter-panel-trigger__badge"
            aria-label={t('admin.filters.activeCount', { count: activeCount })}
          >
            {activeCount}
          </span>
        ) : null}
        <ChevronDown className="admin-filter-panel-trigger__chevron" size={13} aria-hidden />
      </button>

      {open ? (
        <div className="admin-filter-panel" role="dialog" aria-label={t('admin.filters.toggle')}>
          <div className="admin-filter-panel__grid">{filters.map(renderField)}</div>
        </div>
      ) : null}
    </div>
  )
}
