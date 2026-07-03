import { getStatusMeta } from '../../lib/status.js'

export default function StatusPill({ value }) {
  const { label, tone } = getStatusMeta(value)
  return <span className={`status-pill status-pill--${tone}`}>{label}</span>
}
