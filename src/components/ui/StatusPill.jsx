import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getStatusMeta } from '../../lib/status.js'

export default function StatusPill({ value }) {
  const { t } = useI18n()
  const { label, tone } = getStatusMeta(value, t)
  return <span className={`status-pill status-pill--${tone}`}>{label}</span>
}
