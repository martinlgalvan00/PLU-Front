import { LockKeyhole } from 'lucide-react'

export default function LoginButton({ onClick, className = '', label = 'Acceder al panel', compact = false }) {
  return (
    <button
      type="button"
      className={`login-btn ${compact ? 'login-btn--compact' : ''} ${className}`.trim()}
      onClick={onClick}
      title={compact ? label : undefined}
      aria-label={compact ? label : undefined}
    >
      <LockKeyhole size={compact ? 15 : 16} />
      {!compact && label}
    </button>
  )
}
