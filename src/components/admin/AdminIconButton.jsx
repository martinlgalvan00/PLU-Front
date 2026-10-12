export default function AdminIconButton({
  className = '',
  disabled = false,
  icon: Icon,
  label,
  onClick,
  /** Botón de dos estados (ej. fijar/soltar): expone `aria-pressed`. */
  pressed,
  size = 15,
  spinning = false,
  type = 'button',
  variant = 'ghost',
}) {
  return (
    <button
      type={type}
      className={`admin-icon-btn admin-icon-btn--${variant}${className ? ` ${className}` : ''}`.trim()}
      aria-label={label}
      title={label}
      disabled={disabled}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {spinning ? (
        <span className="plu-spinner plu-spinner--sm" aria-hidden="true" />
      ) : (
        <Icon size={size} aria-hidden />
      )}
    </button>
  )
}
