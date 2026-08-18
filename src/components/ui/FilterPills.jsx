import SegmentedSwitch from './SegmentedSwitch.jsx'

export default function FilterPills({
  active,
  ariaLabel,
  className = '',
  onChange,
  options,
  segmented = false,
}) {
  if (segmented) {
    return (
      <SegmentedSwitch
        active={active}
        ariaLabel={ariaLabel}
        className={className}
        onChange={onChange}
        options={options}
      />
    )
  }

  return (
    <div className={`filter-pills ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
      {options.map((option) => {
        const [key, label, shortLabel] = option
        const displayShort = shortLabel ?? label

        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active === key}
            className={`filter-pills__item ${active === key ? 'is-active' : ''}`}
            onClick={() => onChange(key)}
          >
            <span className="filter-pills__label filter-pills__label--full">{label}</span>
            {shortLabel && shortLabel !== label && (
              <span className="filter-pills__label filter-pills__label--short">{displayShort}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
