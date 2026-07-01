export function Field({ error, label, ...props }) {
  const errorId = `${props.name}-error`
  return (
    <label className="field">
      {label}
      <input {...props} aria-describedby={error ? errorId : undefined} aria-invalid={Boolean(error)} />
      {error && <span className="field__error" id={errorId}>{error}</span>}
    </label>
  )
}

export function Select({ label, options, ...props }) {
  return (
    <label className="field">
      {label}
      <select {...props}>
        {options.map((option) => {
          const value = Array.isArray(option) ? option[0] : option
          const text = Array.isArray(option) ? option[1] : option
          return (
            <option key={value} value={value}>
              {text}
            </option>
          )
        })}
      </select>
    </label>
  )
}
