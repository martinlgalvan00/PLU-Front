/** Fallback select — usar solo si hay demasiadas opciones para chips. */
export default function AdminFilterSelect({ id, label, value, onChange, options = [] }) {
  return (
    <label className="admin-filters__select" htmlFor={id}>
      {label && <span className="admin-filters__select-label">{label}</span>}
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  )
}
