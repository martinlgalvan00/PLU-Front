export default function AdminFilterChipGroup({
  id,
  label,
  value,
  onChange,
  options = [],
  compact = false,
  inline = false,
  disabled = false,
}) {
  const labelId = label ? `${id}-label` : undefined

  return (
    <div
      className={[
        'admin-filter-group',
        compact ? 'admin-filter-group--compact' : '',
        inline ? 'admin-filter-group--inline' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="group"
      aria-labelledby={labelId}
    >
      {label && (
        <span id={labelId} className="admin-filter-group__label">
          {label}
        </span>
      )}
      <div className="admin-filter-chips">
        {options.map(([optionValue, optionLabel]) => {
          const active = value === optionValue
          return (
            <button
              key={optionValue}
              type="button"
              className={`admin-filter-chip${active ? ' is-active' : ''}`.trim()}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(optionValue)}
            >
              {optionLabel}
            </button>
          )
        })}
      </div>
    </div>
  )
}
