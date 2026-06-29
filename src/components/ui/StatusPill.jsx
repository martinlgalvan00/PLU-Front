import { getStatusMeta } from '../../lib/status.js'

export default function StatusPill({ value }) {
  const { label, tone } = getStatusMeta(value)
  return <span className={`status status--${tone}`}>{label}</span>
}
