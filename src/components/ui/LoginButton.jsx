import { LockKeyhole, UserRound } from 'lucide-react'

export default function LoginButton({ onClick, className = '', label = 'Acceder al panel', compact = false }) {
  const Icon = compact ? UserRound : LockKeyhole

  return (
    <button
      type="button"
      className={`login-btn ${compact ? 'login-btn--compact' : ''} ${className}`.trim()}
      onClick={onClick}
      title={compact ? label : undefined}
      aria-label={compact ? label : undefined}
    >
      <Icon size={compact ? 18 : 16} strokeWidth={compact ? 2.1 : 2} aria-hidden />
      {!compact && label}
    </button>
  )
}
