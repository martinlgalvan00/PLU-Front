import AdminFilterChipGroup from './AdminFilterChipGroup.jsx'
import AdminFilterCombobox from './AdminFilterCombobox.jsx'
import AdminFilterDateRange from './AdminFilterDateRange.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { neutralValue } from '../../lib/adminFilterValue.js'

/**
 * Panel único de facetas para `AdminFilterBar` (`layout="panel"`).
 *
 * Composición editorial: cada faceta de chips es una fila horizontal (riel),
 * no una columna densa. Select y fechas van abajo en un par más quieto, con
 * el combobox acotado en altura para no empujar la tabla.
 */
export default function AdminFilterPanel({ id, filters }) {
  const { t } = useI18n()

  function fieldClass(filter) {
    if (filter.variant === 'dateRange') return 'admin-filter-panel__field admin-filter-panel__field--date'
    if (filter.variant === 'select') return 'admin-filter-panel__field admin-filter-panel__field--select'
    if (filter.variant === 'toggle') return 'admin-filter-panel__field admin-filter-panel__field--toggle'
    return 'admin-filter-panel__field admin-filter-panel__field--chips'
  }

  function renderField(filter) {
    if (filter.variant === 'dateRange') {
      return (
        <div key={filter.id} className={fieldClass(filter)}>
          <span className="admin-filter-panel__field-label">{filter.label}</span>
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
        <div key={filter.id} className={fieldClass(filter)}>
          <span className="admin-filter-panel__field-label">{filter.label}</span>
          <AdminFilterCombobox filter={filter} t={t} onSelect={filter.onChange} autoFocus={false} />
        </div>
      )
    }

    return (
      <div key={filter.id} className={fieldClass(filter)}>
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
          compact
        />
      </div>
    )
  }

  const chipFilters = filters.filter(
    (filter) => filter.variant !== 'select' && filter.variant !== 'dateRange',
  )
  const metaFilters = filters.filter(
    (filter) => filter.variant === 'select' || filter.variant === 'dateRange',
  )

  return (
    <div id={id} className="admin-filter-panel" role="region" aria-label={t('admin.filters.toggle')}>
      {chipFilters.length > 0 ? (
        <div className="admin-filter-panel__stack">{chipFilters.map(renderField)}</div>
      ) : null}
      {metaFilters.length > 0 ? (
        <div className="admin-filter-panel__meta">{metaFilters.map(renderField)}</div>
      ) : null}
    </div>
  )
}
