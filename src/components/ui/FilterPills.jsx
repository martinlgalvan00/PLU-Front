export default function FilterPills({ active, ariaLabel, className = '', onChange, options }) {
  return (
    <div className={`filter-pills ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={active === key}
          className={`filter-pills__item ${active === key ? 'is-active' : ''}`}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
