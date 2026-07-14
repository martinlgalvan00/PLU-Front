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

/**
 * Fecha con date picker nativo (YYYY-MM-DD).
 * El calendario del browser evita errores de parseo DD/MM vs MM/DD.
 */
export function DateField({
  className = '',
  error,
  hideLabel = false,
  label,
  max,
  min = '1920-01-01',
  ...props
}) {
  const errorId = `${props.name}-error`
  const fieldClass = ['field', 'field--date', className, hideLabel ? 'field--headless' : '']
    .filter(Boolean)
    .join(' ')
  const resolvedMax = max ?? new Date().toISOString().slice(0, 10)
  const empty = !props.value

  return (
    <label className={fieldClass}>
      {!hideLabel ? label : null}
      <span className={`field__date${empty ? ' is-empty' : ''}`.trim()}>
        <input
          {...props}
          type="date"
          min={min}
          max={resolvedMax}
          aria-label={hideLabel ? label : undefined}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
        />
      </span>
      {error ? (
        <span className="field__error" id={errorId} title={error}>
          {error}
        </span>
      ) : null}
    </label>
  )
}

export function Select({ className = '', error, label, options, ...props }) {
  const errorId = `${props.name}-error`
  const fieldClass = ['field', 'field--select', className].filter(Boolean).join(' ')
  const emptySelected = props.value === '' || props.value == null

  return (
    <label className={fieldClass}>
      {label}
      <span className={`field__select${emptySelected ? ' is-empty' : ''}`.trim()}>
        <select
          {...props}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
        >
          {options.map((option) => {
            const value = Array.isArray(option) ? option[0] : option
            const text = Array.isArray(option) ? option[1] : option
            return (
              <option key={value === '' ? '__empty' : value} value={value} disabled={value === ''}>
                {text}
              </option>
            )
          })}
        </select>
        <span className="field__select-chevron" aria-hidden />
      </span>
      {error ? (
        <span className="field__error" id={errorId} title={error}>
          {error}
        </span>
      ) : null}
    </label>
  )
}
