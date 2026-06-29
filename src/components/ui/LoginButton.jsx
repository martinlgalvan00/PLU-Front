import { LockKeyhole } from 'lucide-react'

export default function LoginButton({ onClick, className = '', label = 'Acceder al panel' }) {
  return (
    <button type="button" className={`login-btn ${className}`} onClick={onClick}>
      <LockKeyhole size={16} />
      {label}
    </button>
  )
}
