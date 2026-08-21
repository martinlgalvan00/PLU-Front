import { useI18n } from '../../i18n/I18nProvider.jsx'

/** Rango de fechas de un filtro (`AdminFilterBar`, variant `dateRange`): dos `<input type="date">`
 * con `min`/`max` cruzados para que no se pueda armar un rango invertido desde la UI. */
export default function AdminFilterDateRange({ id, label, value, onChange, disabled = false }) {
  const { t } = useI18n()
  const from = value?.from ?? ''
  const to = value?.to ?? ''
  const isActive = Boolean(from) || Boolean(to)

  return (
    <div className={`admin-filters__date-range${isActive ? ' is-active' : ''}`}>
      {label ? <span className="admin-filters__date-range-label">{label}</span> : null}
      <div className="admin-filters__date-range-fields">
        <label className="admin-filters__date-range-field">
          <span>{t('admin.filters.registeredFrom')}</span>
          <input
            type="date"
            id={`${id}-from`}
            className="admin-filters__date-range-input"
            value={from}
            max={to || undefined}
            disabled={disabled}
            onChange={(event) => onChange({ from: event.target.value, to })}
          />
        </label>
        <label className="admin-filters__date-range-field">
          <span>{t('admin.filters.registeredTo')}</span>
          <input
            type="date"
            id={`${id}-to`}
            className="admin-filters__date-range-input"
            value={to}
            min={from || undefined}
            disabled={disabled}
            onChange={(event) => onChange({ from, to: event.target.value })}
          />
        </label>
      </div>
    </div>
  )
}
