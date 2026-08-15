import { ChevronDown } from 'lucide-react'

export function Field({
  className = '',
  error,
  hideLabel = false,
  icon: Icon,
  label,
  trailing = null,
  ...props
}) {
  const errorId = `${props.name}-error`
  const fieldClass = [
    'field',
    className,
    hideLabel ? 'field--headless' : '',
    error ? 'is-invalid' : '',
    Icon ? 'field--has-icon' : '',
    trailing ? 'field--has-trailing' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <label className={fieldClass}>
      {!hideLabel ? <span className="field__label">{label}</span> : null}
      <span className="field__control-shell">
        {Icon ? <Icon size={16} className="field__icon" aria-hidden /> : null}
        <input
          {...props}
          aria-label={hideLabel ? label : undefined}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
        />
        {trailing}
      </span>
      {error ? (
        <span className="field__error" id={errorId} role="alert" title={error}>
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
  icon: Icon,
  label,
  max,
  min = '1920-01-01',
  ...props
}) {
  const errorId = `${props.name}-error`
  const fieldClass = [
    'field',
    'field--date',
    className,
    hideLabel ? 'field--headless' : '',
    error ? 'is-invalid' : '',
    Icon ? 'field--has-icon' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const resolvedMax = max ?? new Date().toISOString().slice(0, 10)
  const empty = !props.value

  return (
    <label className={fieldClass}>
      {!hideLabel ? <span className="field__label">{label}</span> : null}
      <span className={`field__date${empty ? ' is-empty' : ''}`.trim()}>
        {Icon ? <Icon size={16} className="field__icon" aria-hidden /> : null}
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
        <span className="field__error" id={errorId} role="alert" title={error}>
          {error}
        </span>
      ) : null}
    </label>
  )
}

export function Select({ className = '', error, icon: Icon, label, options, ...props }) {
  const errorId = `${props.name}-error`
  const fieldClass = ['field', 'field--select', className, error ? 'is-invalid' : '', Icon ? 'field--has-icon' : '']
    .filter(Boolean)
    .join(' ')
  const emptySelected = props.value === '' || props.value == null

  return (
    <label className={fieldClass}>
      <span className="field__label">{label}</span>
      <span className={`field__select${emptySelected ? ' is-empty' : ''}`.trim()}>
        {Icon ? <Icon size={16} className="field__icon" aria-hidden /> : null}
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
        <ChevronDown className="field__select-chevron" size={16} strokeWidth={1.75} aria-hidden />
      </span>
      {error ? (
        <span className="field__error" id={errorId} role="alert" title={error}>
          {error}
        </span>
      ) : null}
    </label>
  )
}

/** Opciones binarias / pocas (radios) — p. ej. sexo competitivo. */
export function ChoiceField({
  className = '',
  disabled = false,
  error,
  label,
  name,
  onBlur,
  onChange,
  options = [],
  value,
}) {
  const errorId = `${name}-error`
  const fieldClass = ['field', 'field--choice', className, error ? 'is-invalid' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <fieldset className={fieldClass} aria-describedby={error ? errorId : undefined} aria-invalid={Boolean(error)}>
      <legend className="field__label">{label}</legend>
      <div className="field__choices" role="radiogroup" aria-label={label}>
        {options.map((option) => {
          const optionValue = Array.isArray(option) ? option[0] : option
          const text = Array.isArray(option) ? option[1] : option
          if (optionValue === '') return null
          const active = value === optionValue

          return (
            <label key={optionValue} className={`field__choice${active ? ' is-active' : ''}`.trim()}>
              <input
                checked={active}
                disabled={disabled}
                name={name}
                type="radio"
                value={optionValue}
                onBlur={onBlur}
                onChange={onChange}
              />
              <span className="field__choice-text">{text}</span>
            </label>
          )
        })}
      </div>
      {error ? (
        <span className="field__error" id={errorId} role="alert" title={error}>
          {error}
        </span>
      ) : null}
    </fieldset>
  )
}
