export default function AdminIconButton({
  className = '',
  disabled = false,
  icon: Icon,
  label,
  onClick,
  size = 15,
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
      onClick={onClick}
    >
      <Icon size={size} aria-hidden />
    </button>
  )
}
