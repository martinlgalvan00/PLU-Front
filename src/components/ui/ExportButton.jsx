import { Download, Globe2 } from 'lucide-react'

export default function ExportButton({ iconOnly = false, label, onClick, disabled = false, variant = 'default' }) {
  const Icon = variant === 'gold' ? Globe2 : Download

  return (
    <button
      type="button"
      className={`export-btn export-btn--${variant}${iconOnly ? ' export-btn--icon-only' : ''}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <Icon size={16} aria-hidden />
      {!iconOnly && label}
    </button>
  )
}
