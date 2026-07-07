export function Field({ className = '', error, hideLabel = false, label, ...props }) {
  const errorId = `${props.name}-error`
  const fieldClass = ['field', className, hideLabel ? 'field--headless' : ''].filter(Boolean).join(' ')
  return (
    <label className={fieldClass}>
      {!hideLabel ? label : null}
      <input
        {...props}
        aria-label={hideLabel ? label : undefined}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
      />
      {error ? (
        <span className="field__error" id={errorId} title={error}>
          {error}
        </span>
      ) : null}
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
