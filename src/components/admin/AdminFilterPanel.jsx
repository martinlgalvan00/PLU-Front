import AdminFilterChipGroup from './AdminFilterChipGroup.jsx'
import AdminFilterCombobox from './AdminFilterCombobox.jsx'
import AdminFilterDateRange from './AdminFilterDateRange.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { neutralValue } from '../../lib/adminFilterValue.js'

/**
 * Grilla con todas las facetas juntas -- el contenido del panel único que
 * abre `AdminFilterBar` (`layout="panel"`), en vez de un pill por filtro (ver
 * `AdminFilterPillRow`).
 *
 * Vive en flujo normal dentro de la misma tarjeta que el buscador (la
 * agranda `AdminFilterBar`, ver `.admin-filter-panel` en admin.css): no es
 * un dropdown flotando con `position: absolute`, así que nunca puede quedar
 * montado sobre la tabla de resultados de abajo -- la empuja como cualquier
 * otro contenido del documento.
 */
export default function AdminFilterPanel({ id, filters }) {
  const { t } = useI18n()

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
        <div key={filter.id} className="admin-filter-panel__field admin-filter-panel__field--select">
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
    <div id={id} className="admin-filter-panel" role="region" aria-label={t('admin.filters.toggle')}>
      <div className="admin-filter-panel__grid">{filters.map(renderField)}</div>
    </div>
  )
}
