import { Download, ScrollText, Trophy } from 'lucide-react'
import EmptyState from '../../components/ui/EmptyState.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'

const PLACEHOLDER_KEYS = {
  events: 'events',
  payments: 'payments',
  results: 'results',
  exports: 'exports',
  audit: 'audit',
}

const PLACEHOLDER_ICONS = {
  results: Trophy,
  exports: Download,
  audit: ScrollText,
}

export default function PlaceholderSection({ section }) {
  const { t } = useI18n()
  const key = PLACEHOLDER_KEYS[section] ?? 'events'

  return (
    <EmptyState
      icon={PLACEHOLDER_ICONS[key]}
      title={t(`admin.placeholders.${key}.title`)}
      description={t(`admin.placeholders.${key}.description`)}
    />
  )
}
