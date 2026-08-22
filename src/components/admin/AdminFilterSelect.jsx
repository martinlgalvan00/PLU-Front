import { ChevronDown } from 'lucide-react'

export default function AdminFilterSelect({
  id,
  label,
  ariaLabel,
  value,
  onChange,
  options = [],
  defaultValue,
}) {
  const accessibleName = ariaLabel || label
  const neutral = defaultValue ?? options[0]?.[0]
  const isActive = value !== neutral

  return (
    <div className={`admin-filters__select${isActive ? ' is-active' : ''}`}>
      {/* `label` y no `span`: con el texto visible se anulaba el `aria-label` y
          el `span` no estaba asociado a nada, así que el control quedaba sin
          nombre accesible —un combobox sin nombre para un lector de pantalla, y
          sin forma de encontrarlo por su etiqueta—. La clase no cambia, así que
          el estilo es el mismo. */}
      {label ? (
        <label className="admin-filters__select-label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <div className="admin-filters__select-control">
        <select
          id={id}
          value={value}
          aria-label={label ? undefined : accessibleName}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map(([optionValue, optionLabel]) => (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          ))}
        </select>
        <ChevronDown className="admin-filters__select-icon" size={14} aria-hidden />
      </div>
    </div>
  )
}
