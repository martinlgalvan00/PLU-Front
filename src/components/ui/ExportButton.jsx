import { Download, Globe2 } from 'lucide-react'

export default function ExportButton({
  iconOnly = false,
  label,
  ariaLabel,
  onClick,
  disabled = false,
  variant = 'default',
  className = '',
}) {
  const Icon = variant === 'gold' ? Globe2 : Download
  const accessibleName = ariaLabel || label

  return (
    <button
      type="button"
      className={`export-btn export-btn--${variant}${iconOnly ? ' export-btn--icon-only' : ''}${className ? ` ${className}` : ''}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label={accessibleName}
      title={accessibleName}
    >
      <Icon size={16} aria-hidden />
      {!iconOnly && label}
    </button>
  )
}
