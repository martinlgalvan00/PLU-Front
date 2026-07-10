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

export function Select({ error, label, options, ...props }) {
  const errorId = `${props.name}-error`
  return (
    <label className="field">
      {label}
      <select
        {...props}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
      >
        {options.map((option) => {
          const value = Array.isArray(option) ? option[0] : option
          const text = Array.isArray(option) ? option[1] : option
          return (
            <option key={value} value={value} disabled={value === ''}>
              {text}
            </option>
          )
        })}
      </select>
      {error ? (
        <span className="field__error" id={errorId} title={error}>
          {error}
        </span>
      ) : null}
    </label>
  )
}
