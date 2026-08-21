import { useI18n } from '../../i18n/I18nProvider.jsx'

/** Rango de fechas de un filtro (`AdminFilterBar`, variant `dateRange`): un solo control con dos
 * `<input type="date">` separados por un guion, `min`/`max` cruzados para que no se pueda armar
 * un rango invertido desde la UI. Nombre accesible por `aria-label` -- sin texto "Desde"/"Hasta"
 * visible, para que el control quede tan compacto como un select. */
export default function AdminFilterDateRange({ id, label, value, onChange, disabled = false }) {
  const { t } = useI18n()
  const from = value?.from ?? ''
  const to = value?.to ?? ''
  const isActive = Boolean(from) || Boolean(to)

  return (
    <div className={`admin-filters__date-range${isActive ? ' is-active' : ''}`}>
      {label ? <span className="admin-filters__date-range-label">{label}</span> : null}
      <div className="admin-filters__date-range-fields">
        <input
          type="date"
          id={`${id}-from`}
          className="admin-filters__date-range-input"
          aria-label={t('admin.filters.registeredFrom')}
          value={from}
          max={to || undefined}
          disabled={disabled}
          onChange={(event) => onChange({ from: event.target.value, to })}
        />
        <span className="admin-filters__date-range-sep" aria-hidden="true">
          –
        </span>
        <input
          type="date"
          id={`${id}-to`}
          className="admin-filters__date-range-input"
          aria-label={t('admin.filters.registeredTo')}
          value={to}
          min={from || undefined}
          disabled={disabled}
          onChange={(event) => onChange({ from, to: event.target.value })}
        />
      </div>
    </div>
  )
}
