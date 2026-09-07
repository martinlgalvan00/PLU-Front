import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  activeDateRangePresetId,
  dateRangePreset,
} from '../../lib/adminDateRangeFilter.js'

const DATE_PRESETS = [
  { id: 'last7', labelKey: 'admin.filters.datePresetLast7' },
  { id: 'last30', labelKey: 'admin.filters.datePresetLast30' },
  { id: 'thisMonth', labelKey: 'admin.filters.datePresetThisMonth' },
]

/** Rango de fechas de un filtro (`AdminFilterBar`, variant `dateRange`).
 * - `presentation="inline"` (default): un solo control con dos `<input type="date">`
 *   separados por un guion — compacto como un select.
 * - `presentation="popover"`: presets rápidos + el mismo control dual compacto.
 *   No apila labels “Desde/Hasta” encima de cada input: eso pelea con los
 *   estilos del rango inline y en Windows estira el popover a cientos de px.
 * `min`/`max` cruzados evitan un rango invertido desde la UI. */
export default function AdminFilterDateRange({
  id,
  label,
  value,
  onChange,
  disabled = false,
  presentation = 'inline',
}) {
  const { t } = useI18n()
  const from = value?.from ?? ''
  const to = value?.to ?? ''
  const isActive = Boolean(from) || Boolean(to)
  const fromLabel = t('admin.filters.registeredFrom')
  const toLabel = t('admin.filters.registeredTo')
  const activePreset = presentation === 'popover' ? activeDateRangePresetId({ from, to }) : null

  const dualFields = (
    <div className="admin-filters__date-range-fields">
      <input
        type="date"
        id={`${id}-from`}
        className="admin-filters__date-range-input"
        aria-label={fromLabel}
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
        aria-label={toLabel}
        value={to}
        min={from || undefined}
        disabled={disabled}
        onChange={(event) => onChange({ from, to: event.target.value })}
      />
    </div>
  )

  if (presentation === 'popover') {
    return (
      <div
        className={[
          'admin-filters__date-range',
          'admin-filters__date-range--popover',
          isActive ? 'is-active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {label ? (
          <span className="admin-filters__date-range-label">{label}</span>
        ) : null}
        <div
          className="admin-filters__date-range-presets"
          role="group"
          aria-label={t('admin.filters.datePresets')}
        >
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={[
                'admin-filters__date-range-preset',
                activePreset === preset.id ? 'is-active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={disabled}
              aria-pressed={activePreset === preset.id}
              onClick={() => onChange(dateRangePreset(preset.id))}
            >
              {t(preset.labelKey)}
            </button>
          ))}
        </div>

        <div className="admin-filters__date-range-custom">
          <span className="admin-filters__date-range-custom-label" id={`${id}-range-label`}>
            {t('admin.filters.dateRangeCustom')}
          </span>
          <div
            className="admin-filters__date-range-fields admin-filters__date-range-fields--popover"
            role="group"
            aria-labelledby={`${id}-range-label`}
          >
            <input
              type="date"
              id={`${id}-from`}
              className="admin-filters__date-range-input"
              aria-label={fromLabel}
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
              aria-label={toLabel}
              value={to}
              min={from || undefined}
              disabled={disabled}
              onChange={(event) => onChange({ from, to: event.target.value })}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`admin-filters__date-range${isActive ? ' is-active' : ''}`}>
      {label ? <span className="admin-filters__date-range-label">{label}</span> : null}
      {dualFields}
    </div>
  )
}
