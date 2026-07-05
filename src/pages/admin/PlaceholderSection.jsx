import AdminPageHeader from '../../components/admin/AdminPageHeader.jsx'
import EmptyState from '../../components/ui/EmptyState.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'

const PLACEHOLDER_KEYS = {
  events: 'events',
  payments: 'payments',
  results: 'results',
  exports: 'exports',
  users: 'users',
  audit: 'audit',
}

export default function PlaceholderSection({ section }) {
  const { t } = useI18n()
  const key = PLACEHOLDER_KEYS[section] ?? 'events'

  return (
    <>
      <AdminPageHeader
        title={t(`admin.placeholders.${key}.title`)}
        subtitle={t(`admin.placeholders.${key}.description`)}
      />
      <EmptyState
        title={t('admin.placeholders.moduleDev')}
        description={t(`admin.placeholders.${key}.description`)}
      />
    </>
  )
}
