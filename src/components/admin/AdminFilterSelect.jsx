import { Select } from 'antd'

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

  const selectOptions = options.map(([optionValue, optionLabel]) => ({
    value: optionValue,
    label: optionLabel,
  }))

  return (
    <div className={`admin-filters__select${isActive ? ' is-active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {label ? <span className="admin-filters__select-label" style={{ fontSize: 12, fontWeight: 500 }}>{label}</span> : null}
      <Select
        id={id}
        value={value}
        aria-label={label ? undefined : accessibleName}
        onChange={(val) => onChange(val)}
        options={selectOptions}
        style={{ minWidth: 140 }}
      />
    </div>
  )
}
