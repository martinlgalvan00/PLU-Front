import { Download } from 'lucide-react'

export default function ExportButton({ label, onClick, disabled = false, variant = 'default' }) {
  return (
    <button
      type="button"
      className={`export-btn export-btn--${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      <Download size={16} />
      {label}
    </button>
  )
}
