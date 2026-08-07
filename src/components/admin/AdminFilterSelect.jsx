import { ChevronDown } from 'lucide-react'

/** Fallback select — usar solo si hay demasiadas opciones para chips. */
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
  const selectedLabel = options.find(([optionValue]) => optionValue === value)?.[1] ?? value

  return (
    <label
      className={`admin-filters__select${isActive ? ' is-active' : ''}`}
      htmlFor={id}
    >
      {label ? <span className="admin-filters__select-label">{label}</span> : null}
      <span className="admin-filters__select-control">
        <select
          id={id}
          value={value}
          title={selectedLabel}
          aria-label={label ? undefined : accessibleName}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map(([optionValue, optionLabel]) => (
            <option key={optionValue} value={optionValue} title={optionLabel}>
              {optionLabel}
            </option>
          ))}
        </select>
        <ChevronDown className="admin-filters__select-icon" size={14} aria-hidden />
      </span>
    </label>
  )
}
