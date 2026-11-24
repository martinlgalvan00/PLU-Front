/**
 * Fila con interruptor (checkbox nativo estilado) y su explicación. Se usa para
 * cada sección de la landing y para cada bloque del Constructor, así el
 * comportamiento y el foco son los mismos en los dos.
 */
export default function ToggleRow({
  checked,
  disabled = false,
  onChange,
  title,
  hint,
  className = '',
}) {
  return (
    <label className={`admin-event-form__toggle ${className}`.trim()}>
      <input
        checked={checked}
        className="admin-event-form__toggle-input"
        disabled={disabled}
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="admin-event-form__toggle-ui" aria-hidden />
      <span className="admin-event-form__toggle-copy">
        <strong>{title}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
    </label>
  )
}
