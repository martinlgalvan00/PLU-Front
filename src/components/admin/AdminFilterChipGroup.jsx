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
        {options.map((option) => {
          const [optionValue, optionLabel, optionCount] = option
          const active = value === optionValue
          const showCount = optionCount !== undefined && optionCount !== null && optionCount !== ''

          return (
            <button
              key={optionValue}
              type="button"
              className={`admin-filter-chip${active ? ' is-active' : ''}${showCount ? ' admin-filter-chip--counted' : ''}`.trim()}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(optionValue)}
            >
              <span className="admin-filter-chip__label">{optionLabel}</span>
              {showCount ? (
                <span className="admin-filter-chip__count" aria-hidden>
                  {optionCount}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
