import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getStatusMeta } from '../../lib/status.js'
import Pill from './Pill.jsx'

export default function StatusPill({ value }) {
  const { t } = useI18n()
  const { label, tone } = getStatusMeta(value, t)
  return <Pill tone={tone}>{label}</Pill>
}
